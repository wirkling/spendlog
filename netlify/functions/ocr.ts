import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { createClient } from '@supabase/supabase-js';
import type { Handler } from '@netlify/functions';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
);

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY!,
  },
});

const OCR_PROMPT = `Extract the following information from this receipt image:
1. Vendor/store name
2. Date (format: YYYY-MM-DD)
3. Total amount TTC in EUR (use period as decimal separator)
4. TVA (VAT) amount in EUR (use period as decimal separator)

Important:
- Receipts may use comma as decimal separator - convert to period
- Look for "TTC", "TOTAL", "NET A PAYER", "Summe", "Total" for total amount
- Look for "TVA", "T.V.A.", "MwSt" for VAT amount
- Currency is EUR

Return a JSON object with exactly these keys:
{
  "vendor_name": "string or null",
  "date": "YYYY-MM-DD or null",
  "total_ttc": number_or_null,
  "tva_amount": number_or_null
}

Return ONLY the JSON, no other text.`;

async function callBedrock(base64Image: string, mediaType: string): Promise<Record<string, unknown>> {
  const bedrockPayload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image },
          },
          { type: 'text', text: OCR_PROMPT },
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

  const jsonMatch = assistantText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse JSON from Bedrock response');
  }

  return JSON.parse(jsonMatch[0]);
}

async function scanImage(base64Image: string, mediaType: string): Promise<Record<string, unknown>> {
  return callBedrock(base64Image, mediaType);
}

async function processReceipt(receiptId: string): Promise<Record<string, unknown>> {
  // Fetch receipt
  const { data: receipt, error: receiptError } = await supabase
    .from('receipts')
    .select('*')
    .eq('id', receiptId)
    .single();

  if (receiptError || !receipt) {
    throw new Error('Receipt not found');
  }

  if (!receipt.image_path) {
    throw new Error('No image attached');
  }

  // Mark as processing
  await supabase.from('receipts').update({ scan_status: 'processing' }).eq('id', receiptId);
  await supabase.from('scan_jobs').update({ status: 'processing' }).eq('receipt_id', receiptId);

  // Download image from Supabase Storage
  const { data: imageBlob, error: downloadError } = await supabase.storage
    .from('receipt-images')
    .download(receipt.image_path);

  if (downloadError || !imageBlob) {
    throw new Error('Failed to download image');
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

  const ocrResult = await callBedrock(base64Image, mediaType);

  // Update scan job
  const { data: scanJob } = await supabase
    .from('scan_jobs')
    .select('id')
    .eq('receipt_id', receiptId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (scanJob) {
    await supabase.from('scan_jobs').update({
      status: 'completed',
      result: { ...ocrResult, source: 'bedrock-haiku' },
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

  await supabase.from('receipts').update(updateData).eq('id', receiptId);

  return ocrResult;
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Mode 0: Scan an image directly (returns OCR result without saving)
    if (body.image_base64) {
      const mediaType = body.media_type || 'image/jpeg';
      const result = await scanImage(body.image_base64, mediaType);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, result }),
      };
    }

    // Mode 1: Process a single receipt by ID
    if (body.receipt_id) {
      const result = await processReceipt(body.receipt_id);
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, result }),
      };
    }

    // Mode 2: Process all queued scan jobs
    if (body.process_queue) {
      const { data: jobs } = await supabase
        .from('scan_jobs')
        .select('receipt_id')
        .eq('status', 'queued')
        .limit(5);

      if (!jobs || jobs.length === 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, processed: 0 }),
        };
      }

      const results = [];
      for (const job of jobs) {
        try {
          const result = await processReceipt(job.receipt_id);
          results.push({ receipt_id: job.receipt_id, status: 'completed', result });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          results.push({ receipt_id: job.receipt_id, status: 'failed', error: message });

          await supabase.from('scan_jobs').update({
            status: 'failed',
            error_message: message,
          }).eq('receipt_id', job.receipt_id);

          await supabase.from('receipts').update({
            scan_status: 'failed',
          }).eq('id', job.receipt_id);
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, processed: results.length, results }),
      };
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Provide receipt_id or process_queue: true' }) };
  } catch (error) {
    console.error('OCR error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal error',
      }),
    };
  }
};

export { handler };
