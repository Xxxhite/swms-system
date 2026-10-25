ALTER TABLE `users` ADD `service_field_codes` json;
--> statement-breakpoint
ALTER TABLE `users` ADD `is_supervisor` boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `service_field_codes` = CASE
  WHEN `service_field_code` IS NULL OR `service_field_code` = '' THEN JSON_ARRAY()
  ELSE JSON_ARRAY(CASE `service_field_code`
    WHEN '其他-退役军人' THEN '其他-现退役军人服务'
    WHEN '其他-场馆' THEN '其他-场馆运营'
    WHEN '其他-社会福利' THEN '社会福利'
    WHEN '其他-双百' THEN '其他-双百服务'
    WHEN '其他-心理' THEN '其他-心理服务'
    WHEN '纠纷调节' THEN '纠纷调解'
    ELSE `service_field_code` END) END;
--> statement-breakpoint
ALTER TABLE `users` MODIFY `service_field_codes` json NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `is_supervisor` = true WHERE `position_code` = 'position-5';
