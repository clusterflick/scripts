#!/bin/bash

# Download the last release from each day from clusterflick/data-combined
# Usage: ./download-releases.sh [output_directory] [num_days]

set -e

REPO="clusterflick/data-combined"
API_URL="https://api.github.com/repos/${REPO}/releases"
OUTPUT_DIR="${1:-./combined-data}"
NUM_DAYS="${2:-10}"

echo "Fetching releases from ${REPO} (last release per day for ${NUM_DAYS} days)..."

# Remove existing data directory for fresh download
if [ -d "${OUTPUT_DIR}" ]; then
    echo "Removing existing data directory..."
    rm -rf "${OUTPUT_DIR}"
fi

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Check if jq is available
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    echo "Install with: brew install jq"
    exit 1
fi

# Unauthenticated API calls share a per-IP rate limit that CI runners and
# repeated local runs exhaust quickly, so send a token whenever one is available
GH_API_TOKEN="${PAT:-${GH_TOKEN:-${GITHUB_TOKEN:-}}}"
if [ -z "$GH_API_TOKEN" ] && command -v gh &> /dev/null; then
    GH_API_TOKEN=$(gh auth token 2>/dev/null || true)
fi
CURL_HEADERS=(-sS -L -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [ -n "$GH_API_TOKEN" ]; then
    CURL_HEADERS+=(-H "Authorization: token $GH_API_TOKEN")
fi

# Fetch releases from GitHub API (fetch more to ensure we have enough days)
all_releases_json=$(curl "${CURL_HEADERS[@]}" "${API_URL}?per_page=100")

# Check if we got a valid response
if echo "${all_releases_json}" | jq -e '.message' &> /dev/null; then
    echo "Error fetching releases:"
    echo "${all_releases_json}" | jq -r '.message'
    exit 1
fi

total_releases=$(echo "${all_releases_json}" | jq 'length')
echo "Found ${total_releases} total releases"

# Filter to get only the last release per day (most recent first)
# Group by date, take the first (most recent) from each group, limit to NUM_DAYS
releases_json=$(echo "${all_releases_json}" | jq --argjson days "${NUM_DAYS}" '
  # Sort by published_at descending (most recent first)
  sort_by(.published_at) | reverse |
  # Group by date (extract YYYY-MM-DD from published_at)
  group_by(.published_at | split("T")[0]) |
  # Take the first (most recent) release from each day
  map(.[0]) |
  # Sort again by date descending and limit to requested number of days
  sort_by(.published_at) | reverse |
  .[:$days]
')

# Get the number of releases after filtering
release_count=$(echo "${releases_json}" | jq 'length')
echo "Filtered to ${release_count} releases (one per day)"

# Process each release
for i in $(seq 0 $((release_count - 1))); do
    tag=$(echo "${releases_json}" | jq -r ".[$i].tag_name")
    echo ""
    echo "Processing release: ${tag}"

    # Create directory for this release
    release_dir="${OUTPUT_DIR}/${tag}"
    mkdir -p "${release_dir}"

    # Get asset count
    asset_count=$(echo "${releases_json}" | jq ".[$i].assets | length")

    if [ "${asset_count}" -eq 0 ]; then
        echo "  No assets found"
        continue
    fi

    # Download each asset
    for j in $(seq 0 $((asset_count - 1))); do
        url=$(echo "${releases_json}" | jq -r ".[$i].assets[$j].browser_download_url")
        filename=$(echo "${releases_json}" | jq -r ".[$i].assets[$j].name")

        echo "  Downloading: ${filename}"
        curl -sL -o "${release_dir}/${filename}" "${url}"
    done

    echo "  Done"
done

echo ""
echo "All releases downloaded to ${OUTPUT_DIR}"
