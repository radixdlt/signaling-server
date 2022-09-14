#!/usr/bin/env bash

set -euo pipefail

PRETEXT=""
TITLE=""
TITLELINK=""
TEXT=""
COLOR="GOOD"

function description {
    programName=$0
    echo "Slack notification sender"
    echo "$programName [-t \"messate title\"] [-l \"title link\"] [-m \"message body\"] [-c \"color\"] [-p \"pretext\"]"
    echo "  -t    The title of the message you are posting"
    echo "  -l    The link to source you are posting"
    echo "  -m    The message body"
    echo "  -c    The color type of message (GOOD, WARNING, DANGER)"
    exit 1
}

while getopts ":t:l:m:c:h" opt; do
  case ${opt} in
    t) TITLE="$OPTARG"
    ;;
    l) TITLELINK="$OPTARG"
    ;;
    m) TEXT="$OPTARG"
    ;;
    c) COLOR="$OPTARG"
    ;;
    h) description
    ;;
    \?) echo "Invalid option -$OPTARG" >&2
    ;;
esac
done

if [[ ! "${TITLE}" ||  ! "${TITLELINK}" || ! "${TEXT}" || ! "${COLOR}" ]]; then
    echo "Required arguments"
    description
fi

case ${COLOR} in
  GOOD)
    SLACK_ICON=':white_check_mark:'
    COLOR='good'
    ;;
  WARNING)
    SLACK_ICON=':warning:'
    COLOR='warning'
    ;;
  DANGER)
    SLACK_ICON=':boom:'
    COLOR='danger'
    ;;
  *)
    SLACK_ICON=':slack:'
    COLOR='good'
    ;;
esac

REQUEST_MESSAGE=$(cat << EOF
{
  "attachments":[
    {
      "title":"${SLACK_ICON} ${TITLE}",
      "title_link":"${TITLELINK}",
      "text":"${TEXT}",
      "color":"${COLOR}",
      "actions": [{
        "type": "button",
        "text": "Logs :bookmark_tabs:",
        "url": "${TITLELINK}"
      }]
    }
  ]
}
EOF
)

echo "Sending slack message: $REQUEST_MESSAGE"

send=$(curl --write-out %{http_code} --silent --output /dev/null -X POST -H 'Content-type: application/json' --data "${REQUEST_MESSAGE}" ${SLACK_WEBHOOK_URL})

echo ${REQUEST_MESSAGE}
echo ${send}
