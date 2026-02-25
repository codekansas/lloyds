#!/usr/bin/env bash
set -euo pipefail

required_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

required_var AWS_REGION
required_var ECS_CLUSTER
required_var ECS_SERVICE
required_var ECS_CONTAINER_NAME
required_var IMAGE_URI
required_var APP_ENV

PRISMA_DB_PUSH_ON_BOOT="${PRISMA_DB_PUSH_ON_BOOT:-true}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

CURRENT_TASK_DEF_ARN="$(aws ecs describe-services \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --query 'services[0].taskDefinition' \
  --output text)"

if [[ "$CURRENT_TASK_DEF_ARN" == "None" ]]; then
  echo "Could not resolve current task definition for service $ECS_SERVICE" >&2
  exit 1
fi

aws ecs describe-task-definition \
  --region "$AWS_REGION" \
  --task-definition "$CURRENT_TASK_DEF_ARN" \
  --query 'taskDefinition' \
  > "$TMP_DIR/current-task-def.json"

jq \
  --arg IMAGE_URI "$IMAGE_URI" \
  --arg CONTAINER_NAME "$ECS_CONTAINER_NAME" \
  --arg APP_ENV "$APP_ENV" \
  --arg PRISMA_DB_PUSH_ON_BOOT "$PRISMA_DB_PUSH_ON_BOOT" \
  '
  .containerDefinitions |= map(
    if .name == $CONTAINER_NAME then
      .image = $IMAGE_URI
      | .environment = (
          (.environment // [])
          | map(select(.name != "APP_ENV" and .name != "PRISMA_DB_PUSH_ON_BOOT"))
          + [
              { "name": "APP_ENV", "value": $APP_ENV },
              { "name": "PRISMA_DB_PUSH_ON_BOOT", "value": $PRISMA_DB_PUSH_ON_BOOT }
            ]
        )
    else . end
  )
  | del(
      .taskDefinitionArn,
      .revision,
      .status,
      .requiresAttributes,
      .compatibilities,
      .registeredAt,
      .registeredBy,
      .deregisteredAt,
      .inferenceAccelerators,
      .ephemeralStorage,
      .runtimePlatform
    )
  ' "$TMP_DIR/current-task-def.json" > "$TMP_DIR/new-task-def.json"

NEW_TASK_DEF_ARN="$(aws ecs register-task-definition \
  --region "$AWS_REGION" \
  --cli-input-json "file://$TMP_DIR/new-task-def.json" \
  --query 'taskDefinition.taskDefinitionArn' \
  --output text)"

aws ecs update-service \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$NEW_TASK_DEF_ARN" \
  --force-new-deployment >/dev/null

aws ecs wait services-stable \
  --region "$AWS_REGION" \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE"

echo "Deployed image $IMAGE_URI to $ECS_CLUSTER/$ECS_SERVICE (APP_ENV=$APP_ENV, PRISMA_DB_PUSH_ON_BOOT=$PRISMA_DB_PUSH_ON_BOOT)"
