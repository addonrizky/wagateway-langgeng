CREATE USER 'user1'@'%' IDENTIFIED WITH mysql_native_password BY 'test';
GRANT ALL PRIVILEGES ON *.* TO 'user1'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;

CREATE DATABASE IF NOT EXISTS `walanggeng`;
USE walanggeng;

-- walanggeng.users definition

CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `phone` varchar(100) DEFAULT NULL,
  `status` varchar(100) DEFAULT NULL,
  `webhook_url` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `user_code` varchar(100) DEFAULT NULL,
  `created_on` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=4;


INSERT INTO users (phone, status, webhook_url, user_code, created_on) VALUES('081617387894', '1', 'http://host.docker.internal:8000/api/communication-providers/99a10c75-6849-4fb3-877e-9a68139f8d30/webhooks', '20', '2024-01-31 02:44:52');
INSERT INTO users (phone, status, webhook_url, user_code, created_on) VALUES('085771499832', '1', 'http://host.docker.internal:8000/api/communication-providers/9a25c2ce-eafc-47da-98b7-75e3a5b43666/webhooks', '30', '2024-01-31 02:44:52');
