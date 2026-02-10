import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface OcrRequest {
  receipt_id: string;
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { receipt_id } = JSON.parse(event.body || '{}') as OcrRequest;
    if (!receipt_id) {
      return { statusCode: 400, body: JSON.stringify({ error: 'receipt_id required' }) };
    }

    // Fetch receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', receipt_id)
      .single();

    if (receiptError || !receipt) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Receipt not found' }) };
    }

    if (!receipt.image_path) {
      return { statusCode: 400, body: JSON.stringify({ error: 'No image attached' }) };
    }

    // Download image from Supabase Storage
    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from('receipt-images')
      .download(receipt.image_path);

    if (downloadError || !imageBlob) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to download image' }) };
    }

    // Convert to base64
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString('base64');

    // Determine media type
    const ext = receipt.image_path.split('.').pop()?.toLowerCase();
    const mediaTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
    };
    const mediaType = mediaTypeMap[ext || 'jpg'] || 'image/jpeg';

    // Call Bedrock with Claude Haiku
    const prompt = `Extract the following information from this French receipt image:
1. Vendor/store name
2. Date (format: YYYY-MM-DD)
3. Total amount TTC in EUR (use period as decimal separator)
4. TVA (VAT) amount in EUR (use period as decimal separator)

Important:
- French receipts use comma as decimal separator - convert to period
- Look for "TTC", "TOTAL", "NET A PAYER" for total amount
- Look for "TVA", "T.V.A." for VAT amount
- Currency is EUR

Return a JSON object with exactly these keys:
{
  "vendor_name": "string or null",
  "date": "YYYY-MM-DD or null",
  "total_ttc": number_or_null,
  "tva_amount": number_or_null
}

Return ONLY the JSON, no other text.`;

    const bedrockPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
    };

    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(bedrockPayload),
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const assistantText = responseBody.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Bedrock response');
    }

    const ocrResult = JSON.parse(jsonMatch[0]);

    // Update scan job
    const { data: scanJob } = await supabase
      .from('scan_jobs')
      .select('id')
      .eq('receipt_id', receipt_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (scanJob) {
      await supabase.from('scan_jobs').update({
        status: 'completed',
        result: { ...ocrResult, confidence: 0.95, source: 'bedrock-haiku' },
        confidence: 0.95,
      }).eq('id', scanJob.id);
    }

    // Update receipt
    const updateData: Record<string, unknown> = {
      scan_status: 'completed',
      ocr_raw_result: { ...ocrResult, source: 'bedrock-haiku' },
    };

    if (ocrResult.total_ttc != null) {
      updateData.amount_ttc_cents = Math.round(ocrResult.total_ttc * 100);
    }
    if (ocrResult.tva_amount != null) {
      updateData.amount_tva_cents = Math.round(ocrResult.tva_amount * 100);
    }

    await supabase.from('receipts').update(updateData).eq('id', receipt_id);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, result: ocrResult }),
    };
  } catch (error) {
    console.error('OCR enhance error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal error',
      }),
    };
  }
};

export { handler };
