provider "aws" {
  region = var.aws_region
}

locals {
  service_name   = "${var.app_name}-${var.environment}"
  container_name = "${var.app_name}-${var.environment}"

  cron_schedules = {
    ingest-rss = {
      schedule = "cron(5 * * * ? *)"
      path     = "/api/jobs/ingest-rss"
    }
    summarize = {
      schedule = "cron(0/10 * * * ? *)"
      path     = "/api/jobs/summarize"
    }
    match-users = {
      schedule = "cron(15 * * * ? *)"
      path     = "/api/jobs/match-users"
    }
  }
}

data "aws_route53_zone" "root" {
  name         = "${var.root_domain}."
  private_zone = false
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "random_password" "db_password" {
  length           = 28
  special          = true
  override_special = "!#$%^*()-_=+[]{}:,.?"
}

resource "aws_ecr_repository" "app" {
  name                 = local.service_name
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  repository = aws_ecr_repository.app.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Retain last 30 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 30
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_acm_certificate" "app" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for option in aws_acm_certificate.app.domain_validation_options : option.domain_name => {
      record_name  = option.resource_record_name
      record_value = option.resource_record_value
      record_type  = option.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.root.zone_id
  name    = each.value.record_name
  type    = each.value.record_type
  records = [each.value.record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "app" {
  certificate_arn = aws_acm_certificate.app.arn

  validation_record_fqdns = [
    for record in aws_route53_record.cert_validation : record.fqdn
  ]
}

resource "aws_security_group" "alb" {
  name        = "${local.service_name}-alb"
  description = "ALB security group for ${local.service_name}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "${local.service_name}-ecs"
  description = "ECS task security group for ${local.service_name}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "db" {
  name        = "${local.service_name}-db"
  description = "RDS security group for ${local.service_name}"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "app" {
  name       = "${local.service_name}-db-subnets"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_db_instance" "app" {
  identifier                   = local.service_name
  engine                       = "postgres"
  engine_version               = "16.3"
  instance_class               = var.db_instance_class
  allocated_storage            = var.db_allocated_storage
  max_allocated_storage        = var.db_max_allocated_storage
  storage_type                 = "gp3"
  db_name                      = var.db_name
  username                     = var.db_username
  password                     = random_password.db_password.result
  db_subnet_group_name         = aws_db_subnet_group.app.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  publicly_accessible          = false
  backup_retention_period      = var.environment == "production" ? 7 : 1
  delete_automated_backups     = true
  deletion_protection          = var.environment == "production"
  auto_minor_version_upgrade   = true
  apply_immediately            = true
  skip_final_snapshot          = true
  performance_insights_enabled = false
}

resource "aws_lb" "app" {
  name               = substr("${local.service_name}-alb", 0, 32)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids
}

resource "aws_lb_target_group" "app" {
  name        = substr("${local.service_name}-tg", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = data.aws_vpc.default.id

  health_check {
    path                = "/api/health"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 5
    matcher             = "200-399"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = aws_acm_certificate_validation.app.certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${local.service_name}"
  retention_in_days = 30
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "${local.service_name}/database-url"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = jsonencode({
    DATABASE_URL = format(
      "postgresql://%s:%s@%s:5432/%s?schema=public&sslmode=require",
      var.db_username,
      urlencode(random_password.db_password.result),
      aws_db_instance.app.address,
      var.db_name,
    )
  })
}

resource "aws_secretsmanager_secret" "auth_secret" {
  name = "${local.service_name}/auth-secret"
}

resource "aws_secretsmanager_secret_version" "auth_secret" {
  secret_id     = aws_secretsmanager_secret.auth_secret.id
  secret_string = jsonencode({ AUTH_SECRET = var.auth_secret })
}

resource "aws_secretsmanager_secret" "cron_secret" {
  name = "${local.service_name}/cron-secret"
}

resource "aws_secretsmanager_secret_version" "cron_secret" {
  secret_id     = aws_secretsmanager_secret.cron_secret.id
  secret_string = jsonencode({ CRON_SECRET = var.cron_secret })
}

resource "aws_secretsmanager_secret" "openai_api_key" {
  name = "${local.service_name}/openai-api-key"
}

resource "aws_secretsmanager_secret_version" "openai_api_key" {
  secret_id     = aws_secretsmanager_secret.openai_api_key.id
  secret_string = jsonencode({ OPENAI_API_KEY = var.openai_api_key })
}

resource "aws_secretsmanager_secret" "google_client_secret" {
  name = "${local.service_name}/google-client-secret"
}

resource "aws_secretsmanager_secret_version" "google_client_secret" {
  secret_id     = aws_secretsmanager_secret.google_client_secret.id
  secret_string = jsonencode({ GOOGLE_CLIENT_SECRET = var.google_client_secret })
}

resource "aws_secretsmanager_secret" "github_client_secret" {
  name = "${local.service_name}/github-client-secret"
}

resource "aws_secretsmanager_secret_version" "github_client_secret" {
  secret_id     = aws_secretsmanager_secret.github_client_secret.id
  secret_string = jsonencode({ GITHUB_CLIENT_SECRET = var.github_client_secret })
}

resource "aws_iam_role" "ecs_execution" {
  name = "${local.service_name}-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${local.service_name}-ecs-secret-access"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue", "kms:Decrypt"]
        Resource = [
          aws_secretsmanager_secret.database_url.arn,
          aws_secretsmanager_secret.auth_secret.arn,
          aws_secretsmanager_secret.cron_secret.arn,
          aws_secretsmanager_secret.openai_api_key.arn,
          aws_secretsmanager_secret.google_client_secret.arn,
          aws_secretsmanager_secret.github_client_secret.arn,
        ]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  name = "${local.service_name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_ecs_cluster" "app" {
  name = "${local.service_name}-cluster"
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.service_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = local.container_name
      image     = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "AUTH_TRUST_HOST", value = "true" },
        { name = "OPENAI_MODEL", value = var.openai_model },
        { name = "GOOGLE_CLIENT_ID", value = var.google_client_id },
        { name = "GITHUB_CLIENT_ID", value = var.github_client_id },
      ]
      secrets = [
        { name = "DATABASE_URL", valueFrom = "${aws_secretsmanager_secret.database_url.arn}:DATABASE_URL::" },
        { name = "AUTH_SECRET", valueFrom = "${aws_secretsmanager_secret.auth_secret.arn}:AUTH_SECRET::" },
        { name = "CRON_SECRET", valueFrom = "${aws_secretsmanager_secret.cron_secret.arn}:CRON_SECRET::" },
        { name = "OPENAI_API_KEY", valueFrom = "${aws_secretsmanager_secret.openai_api_key.arn}:OPENAI_API_KEY::" },
        { name = "GOOGLE_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.google_client_secret.arn}:GOOGLE_CLIENT_SECRET::" },
        { name = "GITHUB_CLIENT_SECRET", valueFrom = "${aws_secretsmanager_secret.github_client_secret.arn}:GITHUB_CLIENT_SECRET::" },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])

  depends_on = [
    aws_db_instance.app,
    aws_secretsmanager_secret_version.database_url,
    aws_secretsmanager_secret_version.auth_secret,
    aws_secretsmanager_secret_version.cron_secret,
    aws_secretsmanager_secret_version.openai_api_key,
    aws_secretsmanager_secret_version.google_client_secret,
    aws_secretsmanager_secret_version.github_client_secret,
  ]
}

resource "aws_ecs_service" "app" {
  name            = local.service_name
  cluster         = aws_ecs_cluster.app.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = local.container_name
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_route53_record" "app" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

resource "aws_iam_role" "job_lambda" {
  name = "${local.service_name}-cron-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "job_lambda_logs" {
  role       = aws_iam_role.job_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "job_lambda" {
  type        = "zip"
  source_file = "${path.module}/lambda/trigger_jobs.py"
  output_path = "${path.module}/.terraform/trigger_jobs.zip"
}

resource "aws_lambda_function" "job_lambda" {
  function_name = "${local.service_name}-cron-trigger"
  role          = aws_iam_role.job_lambda.arn
  runtime       = "python3.12"
  handler       = "trigger_jobs.handler"
  filename      = data.archive_file.job_lambda.output_path
  timeout       = 30

  source_code_hash = data.archive_file.job_lambda.output_base64sha256

  environment {
    variables = {
      BASE_URL    = "https://${var.domain_name}"
      CRON_SECRET = var.cron_secret
    }
  }
}

resource "aws_cloudwatch_event_rule" "job" {
  for_each            = local.cron_schedules
  name                = "${local.service_name}-${each.key}"
  schedule_expression = each.value.schedule
}

resource "aws_cloudwatch_event_target" "job" {
  for_each = local.cron_schedules
  rule     = aws_cloudwatch_event_rule.job[each.key].name
  arn      = aws_lambda_function.job_lambda.arn

  input = jsonencode({
    path = each.value.path
  })
}

resource "aws_lambda_permission" "allow_events" {
  for_each      = local.cron_schedules
  statement_id  = "AllowExecutionFromEvents${replace(each.key, "-", "")}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.job_lambda.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.job[each.key].arn
}
