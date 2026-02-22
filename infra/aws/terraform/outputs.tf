output "environment" {
  value = var.environment
}

output "domain_name" {
  value = var.domain_name
}

output "ecr_repository_url" {
  value = aws_ecr_repository.app.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.app.name
}

output "ecs_service_name" {
  value = aws_ecs_service.app.name
}

output "ecs_container_name" {
  value = local.container_name
}

output "alb_dns_name" {
  value = aws_lb.app.dns_name
}

output "route53_zone_id" {
  value = data.aws_route53_zone.root.zone_id
}

output "db_endpoint" {
  value = aws_db_instance.app.address
}

output "db_name" {
  value = aws_db_instance.app.db_name
}

output "db_username" {
  value = aws_db_instance.app.username
}

output "database_url_secret_arn" {
  value = aws_secretsmanager_secret.database_url.arn
}
