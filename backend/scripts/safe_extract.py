import zipfile
import os
import sys
import json
from pathlib import Path

# Allowed extensions for security whitelisting
ALLOWED_EXTENSIONS = {'.py', '.js', '.json', '.png', '.svg', '.css', '.map', '.md'}

def is_safe_path(base_dir: Path, target_path: Path) -> bool:
    """Check if the target path is strictly within the base directory."""
    return os.path.commonpath([base_dir.resolve(), target_path.resolve()]) == str(base_dir.resolve())

def extract_safe(zip_path: str, target_dir: str, extension_type: str):
    """
    Safely extracts a ZIP archive while preventing path traversal (ZIP Slip)
    and enforcing file-type whitelisting.
    """
    base_dir = Path(target_dir).resolve()
    base_dir.mkdir(parents=True, exist_ok=True)

    print(f"Starting safe extraction of {zip_path} to {base_dir} (type: {extension_type})")

    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # 1. Validation Pass
            for member in zip_ref.infolist():
                # Prevent traversal names like ../
                target_path = (base_dir / member.filename).resolve()
                if not is_safe_path(base_dir, target_path):
                    print(f"ERROR: Malicious path detected in ZIP: {member.filename}")
                    sys.exit(1)
                
                # Enforce file type whitelist (skip directories themselves)
                if not member.is_dir():
                    suffix = Path(member.filename).suffix.lower()
                    if suffix not in ALLOWED_EXTENSIONS:
                        print(f"ERROR: Forbidden file type in ZIP: {member.filename}")
                        sys.exit(1)

            # 2. Manifest Validation for plugins
            if extension_type == 'plugin':
                if 'manifest.json' not in [m.filename for m in zip_ref.infolist()]:
                    print("ERROR: Plugin ZIP must contain a manifest.json at the root.")
                    sys.exit(1)

            # 3. Extraction Pass
            zip_ref.extractall(base_dir)
            print("Extraction completed successfully.")

    except zipfile.BadZipFile:
        print("ERROR: Invalid ZIP file.")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python safe_extract.py <zip_path> <target_dir> <type>")
        sys.exit(1)
    
    extract_safe(sys.argv[1], sys.argv[2], sys.argv[3])
