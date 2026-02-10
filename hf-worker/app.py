"""
HuggingFace Spaces Donut OCR Worker
Polls Supabase for queued scan_jobs, processes receipt images with Donut model,
and writes results back.

Deploy as Docker container on HF Spaces with secrets:
  SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import os
import io
import time
import logging
import re
from contextlib import asynccontextmanager

import torch
from PIL import Image
from transformers import DonutProcessor, VisionEncoderDecoderModel
from fastapi import FastAPI
from supabase import create_client, Client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model references
processor = None
model = None
device = None
supabase_client: Client = None

MODEL_NAME = "naver-clova-ix/donut-base-finetuned-cord-v2"


def init_model():
    global processor, model, device
    logger.info(f"Loading model {MODEL_NAME}...")
    processor = DonutProcessor.from_pretrained(MODEL_NAME)
    model = VisionEncoderDecoderModel.from_pretrained(MODEL_NAME)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    model.eval()
    logger.info(f"Model loaded on {device}")


def init_supabase():
    global supabase_client
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        logger.warning("Supabase credentials not set, worker will not process jobs")
        return
    supabase_client = create_client(url, key)
    logger.info("Supabase client initialized")


def extract_receipt_data(image: Image.Image) -> dict:
    """Run Donut inference on a receipt image."""
    task_prompt = "<s_cord-v2>"
    decoder_input_ids = processor.tokenizer(
        task_prompt, add_special_tokens=False, return_tensors="pt"
    ).input_ids

    pixel_values = processor(image, return_tensors="pt").pixel_values

    with torch.no_grad():
        outputs = model.generate(
            pixel_values.to(device),
            decoder_input_ids=decoder_input_ids.to(device),
            max_length=model.decoder.config.max_position_embeddings,
            pad_token_id=processor.tokenizer.pad_token_id,
            eos_token_id=processor.tokenizer.eos_token_id,
            use_cache=True,
            bad_words_ids=[[processor.tokenizer.unk_token_id]],
            return_dict_in_generate=True,
        )

    sequence = processor.batch_decode(outputs.sequences)[0]
    sequence = sequence.replace(processor.tokenizer.eos_token, "").replace(
        processor.tokenizer.pad_token, ""
    )
    result = processor.token2json(sequence)
    return result


def normalize_amount(value) -> float | None:
    """Parse amount string handling comma decimals and currency symbols."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    # Remove currency symbols
    s = re.sub(r'[€$£EUR\s]', '', s, flags=re.IGNORECASE)
    # Handle comma as decimal separator
    s = s.replace(',', '.')
    # Remove thousands separators (dots before last dot)
    parts = s.split('.')
    if len(parts) > 2:
        s = ''.join(parts[:-1]) + '.' + parts[-1]
    try:
        return round(float(s), 2)
    except ValueError:
        return None


def compute_confidence(result: dict) -> float:
    """Estimate confidence based on what fields were successfully extracted."""
    score = 0.0
    total_fields = 4  # vendor, date, total, tva

    if result.get("vendor_name"):
        score += 1
    if result.get("total_ttc") is not None:
        score += 1
    if result.get("date"):
        score += 1
    if result.get("tva_amount") is not None:
        score += 0.5  # TVA is less critical

    return min(score / total_fields, 1.0)


def parse_donut_output(raw: dict) -> dict:
    """Normalize Donut output to our expected format."""
    # Donut CORD format has nested structure
    total_ttc = None
    tva_amount = None
    vendor_name = None
    date_str = None

    # Try to extract from CORD-v2 format
    if isinstance(raw, dict):
        # Look for total price
        for key in ["total_price", "total", "total_etc", "subtotal_price"]:
            if key in raw:
                val = raw[key]
                if isinstance(val, list):
                    for item in val:
                        if isinstance(item, dict):
                            total_ttc = normalize_amount(item.get("total_price") or item.get("price"))
                        else:
                            total_ttc = normalize_amount(item)
                else:
                    total_ttc = normalize_amount(val)
                if total_ttc is not None:
                    break

        # Look for tax
        for key in ["tax_price", "tax", "tva"]:
            if key in raw:
                val = raw[key]
                if isinstance(val, list):
                    for item in val:
                        if isinstance(item, dict):
                            tva_amount = normalize_amount(item.get("tax_price") or item.get("price"))
                        else:
                            tva_amount = normalize_amount(item)
                else:
                    tva_amount = normalize_amount(val)
                if tva_amount is not None:
                    break

        # Store name
        for key in ["store_name", "vendor", "company", "nm"]:
            if key in raw:
                val = raw[key]
                if isinstance(val, list) and val:
                    vendor_name = str(val[0]) if not isinstance(val[0], dict) else val[0].get("nm", "")
                elif isinstance(val, str):
                    vendor_name = val
                if vendor_name:
                    break

    result = {
        "vendor_name": vendor_name,
        "total_ttc": total_ttc,
        "tva_amount": tva_amount,
        "date": date_str,
        "raw": raw,
    }
    result["confidence"] = compute_confidence(result)
    return result


def process_queue():
    """Fetch and process queued scan jobs."""
    if not supabase_client:
        return []

    # Fetch queued jobs (limit 5)
    response = (
        supabase_client.table("scan_jobs")
        .select("*")
        .eq("status", "queued")
        .limit(5)
        .execute()
    )

    if not response.data:
        return []

    processed = []
    for job in response.data:
        job_id = job["id"]
        receipt_id = job["receipt_id"]
        image_path = job["image_path"]

        try:
            # Mark as processing
            supabase_client.table("scan_jobs").update(
                {"status": "processing"}
            ).eq("id", job_id).execute()

            supabase_client.table("receipts").update(
                {"scan_status": "processing"}
            ).eq("id", receipt_id).execute()

            # Download image
            image_bytes = supabase_client.storage.from_("receipt-images").download(image_path)
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

            # Run OCR
            raw_result = extract_receipt_data(image)
            parsed = parse_donut_output(raw_result)

            # Write results
            supabase_client.table("scan_jobs").update({
                "status": "completed",
                "result": parsed,
                "confidence": parsed["confidence"],
            }).eq("id", job_id).execute()

            # Update receipt with OCR data
            update_data = {
                "scan_status": "completed",
                "ocr_raw_result": parsed,
            }
            if parsed.get("total_ttc") is not None:
                update_data["amount_ttc_cents"] = int(parsed["total_ttc"] * 100)
            if parsed.get("tva_amount") is not None:
                update_data["amount_tva_cents"] = int(parsed["tva_amount"] * 100)

            supabase_client.table("receipts").update(update_data).eq("id", receipt_id).execute()

            # Check if confidence is low -> trigger Bedrock enhancement
            if parsed["confidence"] < 0.7:
                logger.info(f"Low confidence ({parsed['confidence']}) for job {job_id}, needs enhancement")

            processed.append({"job_id": job_id, "status": "completed", "confidence": parsed["confidence"]})

        except Exception as e:
            logger.error(f"Failed to process job {job_id}: {e}")
            supabase_client.table("scan_jobs").update({
                "status": "failed",
                "error_message": str(e),
            }).eq("id", job_id).execute()

            supabase_client.table("receipts").update(
                {"scan_status": "failed"}
            ).eq("id", receipt_id).execute()

            processed.append({"job_id": job_id, "status": "failed", "error": str(e)})

    return processed


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_model()
    init_supabase()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/")
def health():
    return {"status": "ok", "model": MODEL_NAME, "device": str(device)}


@app.post("/process-queue")
def process_queue_endpoint():
    results = process_queue()
    return {"processed": len(results), "results": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
