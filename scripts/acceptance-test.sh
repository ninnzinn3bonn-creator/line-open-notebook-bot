#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
mode="${DEPLOYMENT_MODE:-tunnel}"
DEPLOYMENT_MODE="$mode" bash scripts/doctor.sh
compose=(docker compose -f docker-compose.yml)
[[ "$mode" == "tunnel" ]] && compose+=(-f docker-compose.oci.yml) || compose+=(-f docker-compose.production.yml)

DEPLOYMENT_MODE="$mode" bash scripts/healthcheck-oci.sh

# shellcheck disable=SC2016
"${compose[@]}" exec -T bridge node --input-type=module -e '
import { createHmac } from "node:crypto";
const token=process.env.LINE_CHANNEL_ACCESS_TOKEN;
const secret=process.env.LINE_CHANNEL_SECRET;
const base=process.env.PUBLIC_HOST ? `https://${process.env.PUBLIC_HOST}` : "";
const endpoint=base+"/webhooks/line";
const headers={authorization:`Bearer ${token}`};
const info=await fetch("https://api.line.me/v2/bot/info",{headers});
if(!info.ok) throw new Error(`LINE bot info ${info.status}`);
const configured=await fetch("https://api.line.me/v2/bot/channel/webhook/endpoint",{headers});
const body=await configured.json();
if(!configured.ok || body.endpoint!==endpoint || body.active!==true) throw new Error("LINE webhook registration mismatch");
const payload=JSON.stringify({destination:"acceptance",events:[]});
const signature=createHmac("sha256",secret).update(payload).digest("base64");
const delivered=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json","x-line-signature":signature},body:payload});
if(delivered.status!==200) throw new Error(`signed webhook ${delivered.status}`);
console.log("PASS LINE token, registered endpoint, active state, and signed delivery");
'

echo "PASS automated acceptance checks"
echo "PENDING manual: LINE端末で通常回答、対象外、有人案内、3ラリー、再起動後回答を確認"
