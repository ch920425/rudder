ALTER TABLE "chat_conversations" ADD COLUMN "forked_from_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "forked_from_message_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD COLUMN "fork_root_conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_forked_from_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("forked_from_conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_forked_from_message_id_chat_messages_id_fk" FOREIGN KEY ("forked_from_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_fork_root_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("fork_root_conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_conversations_forked_from_conversation_idx" ON "chat_conversations" USING btree ("forked_from_conversation_id");--> statement-breakpoint
CREATE INDEX "chat_conversations_fork_root_idx" ON "chat_conversations" USING btree ("fork_root_conversation_id");
