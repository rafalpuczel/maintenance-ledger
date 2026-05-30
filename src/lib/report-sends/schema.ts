import { z } from "zod";

// Which Send button produced a send row. 'client' targets the project contact;
// 'pm' targets a picked contact from the list (FR-019/020).
export const recipientTypeSchema = z.enum(["pm", "client"]);
export type RecipientType = z.infer<typeof recipientTypeSchema>;

// The shape inserted on a successful send. Built by the send route, not a user
// form — the schema keeps the insert honest (a real recipient address, a valid
// report id) before it reaches the DB. z.uuid()/z.email() are the zod v4
// top-level validators (the chained .uuid()/.email() are deprecated).
export const sendRecordSchema = z.object({
  report_id: z.uuid(),
  recipient_type: recipientTypeSchema,
  recipient_email: z.email(),
  pm_contact_id: z.uuid().nullable(),
});

export type SendRecordInput = z.infer<typeof sendRecordSchema>;
