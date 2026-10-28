-- Preserve measured usage when upgrading an existing installation. New request IDs match
-- the live tracker, so reapplying/importing never double-counts the same provider call.
INSERT OR IGNORE INTO quota_reservations(id,user_id,resource,period,reserved,actual,status,policy_version,created_at)
SELECT t.request_id || ':' || t.call_index,t.user_id,'tokens','lifetime',
  CASE WHEN t.usage_known=1 AND t.usage_final=1 THEN t.total_tokens ELSE 65536 END,
  CASE WHEN t.status='duplicate' THEN 0 WHEN t.usage_known=1 AND t.usage_final=1 THEN t.total_tokens ELSE NULL END,
  CASE WHEN t.status='duplicate' OR (t.usage_known=1 AND t.usage_final=1) THEN 'settled' ELSE 'reserved' END,
  p.version,t.created_at
FROM ai_token_usage t JOIN user_subscriptions s ON s.user_id=t.user_id JOIN plans p ON p.code=s.plan_code;
