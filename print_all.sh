#!/bin/bash

# Usage: ./print_all.sh [options] [optional_subdir]
# Options:
#   -e, --exclude DIR   Exclude any path containing DIR. Can be used multiple times.
#
# This script:
# 1. Runs printer.py and writes its output to out_files.txt
# 2. Finds every *.ts file (excluding node_modules, .next, and specified dirs)
#    and appends the file header + contents to out.txt
# 3. Redacts values in .env.local and writes to redacted_env_local.txt

set -euo pipefail

# ---------------------------------------------------------------------
# 1. Parse arguments
# ---------------------------------------------------------------------
EXCLUDE_DIRS=()
POSITIONAL_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--exclude)
      if [[ -n "$2" && "$2" != -* ]]; then
        EXCLUDE_DIRS+=("$2")
        shift # past argument
        shift # past value
      else
        echo "ERROR: --exclude flag requires a directory name." >&2
        exit 1
      fi
      ;;
    *)
      # Assume it's a positional argument (like the search directory)
      POSITIONAL_ARGS+=("$1")
      shift # past argument
      ;;
  esac
done

# Restore positional arguments so $1 is the search directory
set -- "${POSITIONAL_ARGS[@]}"

# The first positional argument is the search directory; defaults to current dir
SEARCH_DIR="${1:-.}"

# ---------------------------------------------------------------------
# 2. Run printer.py
# ---------------------------------------------------------------------
echo "Running printer.py ..."
python3 printer.py > out_files.txt

# ---------------------------------------------------------------------
# 3. Validate search directory
# ---------------------------------------------------------------------
echo "Scanning directory: $SEARCH_DIR"
if [ ! -d "$SEARCH_DIR" ]; then
  echo "ERROR: Directory '$SEARCH_DIR' does not exist."
  exit 1
fi

# ---------------------------------------------------------------------
# 4. Collect every *.ts file and write header + content to out.txt
# ---------------------------------------------------------------------
echo "Collecting TypeScript files ..."
> out.txt # truncate if it already exists

# Build the find command arguments in an array for safety
find_args=("$SEARCH_DIR" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.css" -o -name "*.js" \))

find_args+=(! -path "*/node_modules/*" ! -path "*/.next/*")

# Add any user-specified directory exclusions
# This check prevents "unbound variable" error when set -u is on and EXCLUDE_DIRS is empty
if [ ${#EXCLUDE_DIRS[@]} -gt 0 ]; then
  for dir in "${EXCLUDE_DIRS[@]}"; do
    find_args+=(! -path "*/$dir/*")
    echo "Excluding paths containing '$dir'..."
  done
fi

# Use null-separated filenames to handle spaces safely
find "${find_args[@]}" -print0 |
  while IFS= read -r -d '' file; do
    {
      echo "=== $file ==="
      cat "$file"
      echo
    } >> out.txt
  done

# ---------------------------------------------------------------------
# 5. Redact .env.local if present
# ---------------------------------------------------------------------
if [ -f ".env.local" ]; then
  echo "Redacting .env.local ..."
  sed 's/=.*/=REDACTED/' .env.local > redacted_env_local.txt
else
  echo "WARNING: .env.local not found; skipping redaction."
fi

echo "Finished. Outputs:"
echo "  • out_files.txt"
echo "  • out.txt"
echo "  • redacted_env_local.txt (if .env.local existed)"