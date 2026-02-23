variable "aws_region" {
  description = "AWS region for the environment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name: staging or production"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either staging or production."
  }
}

variable "root_domain" {
  description = "Root Route53 domain"
  type        = string
  default     = "bolte.cc"
}

variable "domain_name" {
  description = "Fully-qualified domain for this environment"
  type        = string
}

variable "app_name" {
  description = "Application base name"
  type        = string
  default     = "lloyds"
}

variable "image_tag" {
  description = "Docker tag used by ECS service"
  type        = string
  default     = "latest"
}

variable "container_port" {
  description = "Container port exposed by Next.js app"
  type        = number
  default     = 3000
}

variable "cpu" {
  description = "Fargate task CPU units"
  type        = number
  default     = 1024
}

variable "memory" {
  description = "Fargate task memory in MiB"
  type        = number
  default     = 2048
}

variable "desired_count" {
  description = "Desired running task count"
  type        = number
  default     = 1
}

variable "db_name" {
  description = "RDS database name"
  type        = string
}

variable "db_username" {
  description = "RDS database username"
  type        = string
  default     = "lloydsadmin"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GiB"
  type        = number
  default     = 20
}

variable "db_max_allocated_storage" {
  description = "Max autoscaled storage in GiB"
  type        = number
  default     = 100
}

variable "auth_secret" {
  description = "Auth.js AUTH_SECRET"
  type        = string
  sensitive   = true
}

variable "cron_secret" {
  description = "Secret used for cron endpoint authorization"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_model" {
  description = "OpenAI model for summaries/moderation"
  type        = string
  default     = "gpt-4.1-mini"
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_client_id" {
  description = "GitHub OAuth client ID"
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}
