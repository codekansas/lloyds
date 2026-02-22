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
required_var SOURCE_ECR_REPOSITORY_URL
required_var TARGET_ECR_REPOSITORY_URL
required_var IMAGE_TAG

SOURCE_REPOSITORY_NAME="${SOURCE_ECR_REPOSITORY_URL#*/}"
TARGET_REPOSITORY_NAME="${TARGET_ECR_REPOSITORY_URL#*/}"

IMAGE_MANIFEST="$(aws ecr batch-get-image \
  --region "$AWS_REGION" \
  --repository-name "$SOURCE_REPOSITORY_NAME" \
  --image-ids "imageTag=$IMAGE_TAG" \
  --query 'images[0].imageManifest' \
  --output text)"

if [[ -z "$IMAGE_MANIFEST" || "$IMAGE_MANIFEST" == "None" ]]; then
  echo "Could not find image manifest for $SOURCE_REPOSITORY_NAME:$IMAGE_TAG" >&2
  exit 1
fi

aws ecr put-image \
  --region "$AWS_REGION" \
  --repository-name "$TARGET_REPOSITORY_NAME" \
  --image-tag "$IMAGE_TAG" \
  --image-manifest "$IMAGE_MANIFEST" >/dev/null

aws ecr put-image \
  --region "$AWS_REGION" \
  --repository-name "$TARGET_REPOSITORY_NAME" \
  --image-tag latest \
  --image-manifest "$IMAGE_MANIFEST" >/dev/null

echo "Promoted image $SOURCE_REPOSITORY_NAME:$IMAGE_TAG to $TARGET_REPOSITORY_NAME:$IMAGE_TAG"
