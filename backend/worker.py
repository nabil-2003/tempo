import json
import sys
from fastapi import HTTPException
from converter import convert_to_mp3, download_original

if __name__ == "__main__":
    try:
        if len(sys.argv) > 4 and sys.argv[4] == "original":
            download_original(sys.argv[1], sys.argv[2])
        else:
            convert_to_mp3(sys.argv[1], sys.argv[2], int(sys.argv[3]))
    except HTTPException as error:
        print(json.dumps({"status": error.status_code, "detail": error.detail}))
        sys.exit(1)
    except Exception:
        print(json.dumps({"status": 422, "detail": "Media conversion failed."}))
        sys.exit(1)
