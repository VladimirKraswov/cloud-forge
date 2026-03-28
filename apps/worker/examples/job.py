from cloudforge import info, warn, upload_artifact, artifacts_path, input_path, raise_if_cancel_requested

info("job started")

dataset = input_path("train.jsonl")
info(f"dataset path: {dataset}")

raise_if_cancel_requested()

model_file = artifacts_path("model.bin")
model_file.parent.mkdir(parents=True, exist_ok=True)
model_file.write_bytes(b"demo-model")

result = upload_artifact(model_file)
info(f"artifact uploaded: {result['relative_path']}")