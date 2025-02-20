REPO_URL='https://api.github.com/repos/clusterflick/data-retrieved/releases/latest'

RESPONSE_LIST=$(curl -sS -L -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" $REPO_URL)

for f in $(echo "$RESPONSE_LIST" | grep browser_download | cut -d\" -f4);
do
    echo "Getting $f ..."
    wget "$f" --quiet -P ./retrieved-data/
done
