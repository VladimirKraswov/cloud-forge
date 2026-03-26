import os
import requests
import subprocess

SERVER = os.getenv("SERVER_URL", "http://host.docker.internal:3000")
TOKEN = os.environ.get("RUN_TOKEN")

if not TOKEN:
    print("RUN_TOKEN missing")
    exit(1)

# claim job
r = requests.post(f"{SERVER}/claim", json={"token": TOKEN})
config = r.json()

if "error" in config:
    print("Error:", config["error"])
    exit(1)

job_id = config["job_id"]
cmd = config["command"]

print(f"Running job {job_id}: {cmd}")

proc = subprocess.Popen(
    cmd,
    shell=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT
)

# stream logs
for line in iter(proc.stdout.readline, b''):
    text = line.decode(errors="ignore")
    print(text, end="")

    try:
        requests.post(f"{SERVER}/logs", json={
            "job_id": job_id,
            "message": text
        })
    except:
        pass

proc.wait()

status = "finished" if proc.returncode == 0 else "failed"

requests.post(f"{SERVER}/finish", json={
    "job_id": job_id,
    "status": status
})

print(f"Job finished with status: {status}")