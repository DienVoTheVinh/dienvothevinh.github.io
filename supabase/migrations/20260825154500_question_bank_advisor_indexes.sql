-- Cover foreign keys used by question-bank ownership and source-document joins.
-- These indexes keep imports, cleanup and source-exam cloning stable as the bank grows.

create index if not exists vm_qb_documents_created_by_idx
  on private.vm_question_bank_documents (created_by);

create index if not exists vm_qb_items_created_by_idx
  on private.vm_question_bank_items (created_by);

create index if not exists vm_qb_taxonomy_created_by_idx
  on private.vm_question_bank_taxonomy (created_by);

create index if not exists vm_qb_exam_specs_created_by_idx
  on private.vm_question_bank_exam_specs (created_by);

create index if not exists vm_qb_exam_occurrences_source_document_idx
  on private.vm_question_bank_exam_occurrences (source_document_id);
