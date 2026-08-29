-- ============================================================================
-- Migration: Add ai_explanations.model_used for provider auditing
-- Records which AI provider/model actually answered (gemini-3.5-flash,
-- deepseek-chat, qwen3-max). Purely for our own debugging/auditing — never
-- surfaced in the frontend response or UI.
-- Safe to re-run: uses "if not exists".
-- ============================================================================

alter table ai_explanations
  add column if not exists model_used text;

-- Verify:
select column_name, data_type
from information_schema.columns
where table_name = 'ai_explanations'
order by ordinal_position;
