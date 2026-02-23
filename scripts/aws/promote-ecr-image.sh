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
SOURCE_REGISTRY="${SOURCE_ECR_REPOSITORY_URL%%/*}"
TARGET_REGISTRY="${TARGET_ECR_REPOSITORY_URL%%/*}"

SOURCE_IMAGE="${SOURCE_ECR_REPOSITORY_URL}:${IMAGE_TAG}"
TARGET_IMAGE="${TARGET_ECR_REPOSITORY_URL}:${IMAGE_TAG}"
TARGET_IMAGE_LATEST="${TARGET_ECR_REPOSITORY_URL}:latest"

# Validate that the source image exists before attempting to copy.
aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$SOURCE_REPOSITORY_NAME" \
  --image-ids "imageTag=$IMAGE_TAG" >/dev/null

aws ecr get-login-password --region "$AWS_REGION" | \
  docker login --username AWS --password-stdin "$SOURCE_REGISTRY" >/dev/null

if [[ "$TARGET_REGISTRY" != "$SOURCE_REGISTRY" ]]; then
  aws ecr get-login-password --region "$AWS_REGION" | \
    docker login --username AWS --password-stdin "$TARGET_REGISTRY" >/dev/null
fi

docker pull "$SOURCE_IMAGE" >/dev/null
docker tag "$SOURCE_IMAGE" "$TARGET_IMAGE"
docker tag "$SOURCE_IMAGE" "$TARGET_IMAGE_LATEST"

docker push "$TARGET_IMAGE" >/dev/null
docker push "$TARGET_IMAGE_LATEST" >/dev/null

echo "Promoted image $SOURCE_REPOSITORY_NAME:$IMAGE_TAG to $TARGET_REPOSITORY_NAME:$IMAGE_TAG"
