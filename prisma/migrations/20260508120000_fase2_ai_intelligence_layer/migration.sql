-- ============================================================================
-- Fase 2 — AI Intelligence Layer
-- ============================================================================
-- Adiciona infra pra:
--   1. Prompt Composer 4 layers (org.ai_security_rules)
--   2. Intent Classifier (org.ai_classifier_threshold + ai_agent_runs.classified_*)
--   3. Confirmação destrutiva (ai_pending_actions)
--   4. RAG vetorial (extension pgvector + ai_vector_entries)
-- ============================================================================

-- 1. Extension pgvector (RAG)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Organization: regras de segurança e threshold do classifier
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "ai_security_rules" JSONB,
  ADD COLUMN IF NOT EXISTS "ai_classifier_threshold" DECIMAL(3, 2) DEFAULT 0.85;

-- 3. AiAgentRun: campos do classifier
ALTER TABLE "ai_agent_runs"
  ADD COLUMN IF NOT EXISTS "classified_intent" TEXT,
  ADD COLUMN IF NOT EXISTS "classifier_confidence" DECIMAL(4, 3),
  ADD COLUMN IF NOT EXISTS "skipped_orchestrator" BOOLEAN NOT NULL DEFAULT false;

-- 4. Enums pro PendingAction
DO $$ BEGIN
  CREATE TYPE "AiPendingActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'EXECUTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "AiPendingActionImpact" AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 5. Tabela ai_pending_actions
CREATE TABLE IF NOT EXISTS "ai_pending_actions" (
  "id"               TEXT NOT NULL,
  "agent_run_id"     TEXT NOT NULL,
  "conversation_id"  TEXT NOT NULL,
  "agent_id"         TEXT NOT NULL,
  "tool_name"        TEXT NOT NULL,
  "args"             JSONB NOT NULL,
  "preview"          JSONB NOT NULL,
  "status"           "AiPendingActionStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at"       TIMESTAMP(3) NOT NULL,
  "approved_by"      TEXT,
  "approved_at"      TIMESTAMP(3),
  "rejected_by"      TEXT,
  "rejected_at"      TIMESTAMP(3),
  "rejected_reason"  TEXT,
  "execution_result" JSONB,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ai_pending_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ai_pending_conv_status" ON "ai_pending_actions"("conversation_id", "status");
CREATE INDEX IF NOT EXISTS "idx_ai_pending_status_exp"  ON "ai_pending_actions"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "idx_ai_pending_run"         ON "ai_pending_actions"("agent_run_id");

ALTER TABLE "ai_pending_actions"
  ADD CONSTRAINT "ai_pending_actions_agent_run_id_fkey"
  FOREIGN KEY ("agent_run_id") REFERENCES "ai_agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_pending_actions"
  ADD CONSTRAINT "ai_pending_actions_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_pending_actions"
  ADD CONSTRAINT "ai_pending_actions_agent_id_fkey"
  FOREIGN KEY ("agent_id") REFERENCES "ai_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. Tabela ai_vector_entries (RAG)
CREATE TABLE IF NOT EXISTS "ai_vector_entries" (
  "id"              TEXT NOT NULL,
  "owner_type"      TEXT NOT NULL,
  "owner_id"        TEXT NOT NULL,
  "conversation_id" TEXT,
  "agent_id"        TEXT,
  "contact_id"      TEXT,
  "content"         TEXT NOT NULL,
  "embedding"       vector(1536) NOT NULL,
  "metadata"        JSONB NOT NULL DEFAULT '{}',
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_vector_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ai_vec_owner"   ON "ai_vector_entries"("owner_type", "owner_id");
CREATE INDEX IF NOT EXISTS "idx_ai_vec_agent"   ON "ai_vector_entries"("agent_id");
CREATE INDEX IF NOT EXISTS "idx_ai_vec_contact" ON "ai_vector_entries"("contact_id");
CREATE INDEX IF NOT EXISTS "idx_ai_vec_conv"    ON "ai_vector_entries"("conversation_id");

-- ivfflat: bom pra ~10k-1M registros, lists=100 razoável pra começar
CREATE INDEX IF NOT EXISTS "idx_ai_vec_embedding"
  ON "ai_vector_entries"
  USING ivfflat ("embedding" vector_cosine_ops)
  WITH (lists = 100);
