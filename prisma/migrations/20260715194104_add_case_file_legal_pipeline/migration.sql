-- CreateEnum
CREATE TYPE "CaseFileStatus" AS ENUM ('TRIAGE', 'DOCS_PENDING', 'DOCS_COMPLETE', 'SUMMARY_READY', 'PETITION_DRAFT', 'PETITION_APPROVED', 'FILED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "case_files" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "status" "CaseFileStatus" NOT NULL DEFAULT 'TRIAGE',
    "case_summary" TEXT,
    "case_summary_updated_at" TIMESTAMP(3),
    "petition_draft" TEXT,
    "petition_draft_status" TEXT NOT NULL DEFAULT 'NONE',
    "petition_approved_by_id" TEXT,
    "petition_approved_at" TIMESTAMP(3),
    "protocol_number" TEXT,
    "protocol_date" TIMESTAMP(3),
    "protocol_court" TEXT,
    "external_provider" TEXT,
    "external_ref" TEXT,
    "external_synced_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" TEXT NOT NULL,
    "case_file_id" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message_id" TEXT,
    "extraction_status" TEXT NOT NULL DEFAULT 'PENDING',
    "extraction_method" TEXT,
    "extracted_text" TEXT,
    "notes" TEXT,
    "received_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "case_files_card_id_key" ON "case_files"("card_id");

-- CreateIndex
CREATE INDEX "case_files_organization_id_status_idx" ON "case_files"("organization_id", "status");

-- CreateIndex
CREATE INDEX "case_documents_case_file_id_idx" ON "case_documents"("case_file_id");

-- AddForeignKey
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_files" ADD CONSTRAINT "case_files_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_case_file_id_fkey" FOREIGN KEY ("case_file_id") REFERENCES "case_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
