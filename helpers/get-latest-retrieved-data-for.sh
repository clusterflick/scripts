#!/bin/bash

# Download specific venues' data from the latest clusterflick/data-retrieved release
# Usage: ./helpers/get-latest-retrieved-data-for.sh <venue-id> [<venue-id> ...]
# Example: ./helpers/get-latest-retrieved-data-for.sh everymancinema.com-barnet bfi.org.uk

set -e

REPO_URL='https://api.github.com/repos/clusterflick/data-retrieved/releases/latest'
OUTPUT_DIR='./retrieved-data'

if [ "$#" -eq 0 ]; then
    echo "Error: no venue id provided."
    echo "Usage: $0 <venue-id> [<venue-id> ...]"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    echo "Install with: brew install jq"
    exit 1
fi

RESPONSE=$(curl -sS -L -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" $REPO_URL)

if echo "$RESPONSE" | jq -e '.message' &> /dev/null; then
    echo "Error fetching latest release:"
    echo "$RESPONSE" | jq -r '.message'
    exit 1
fi

echo "Using release: $(echo "$RESPONSE" | jq -r '.tag_name')"
mkdir -p "$OUTPUT_DIR"

for venue in "$@"; do
    url=$(echo "$RESPONSE" | jq -r --arg venue "$venue" '.assets[] | select(.name == $venue) | .browser_download_url')

    if [ -z "$url" ]; then
        echo "Error: no venue \"$venue\" in the latest release."
        matches=$(echo "$RESPONSE" | jq -r --arg venue "$venue" '.assets[] | select(.name | contains($venue)) | "  \(.name)"')
        if [ -n "$matches" ]; then
            echo "Did you mean:"
            echo "$matches"
        fi
        exit 1
    fi

    echo "Getting $venue ..."
    curl -sSL -o "$OUTPUT_DIR/$venue" "$url"
done

echo "Done"
