import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "Task Management <onboarding@resend.dev>";

function emailWrapper(content: string): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); padding: 24px 32px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">Task Management</h1>
      </div>
      <div style="padding: 32px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        ${content}
      </div>
      <div style="text-align: center; padding: 16px; color: #9ca3af; font-size: 12px;">
        &copy; ${new Date().getFullYear()} Task Management. All rights reserved.
      </div>
    </div>
  `;
}

export async function sendTaskAssignmentEmail(
  toEmail: string,
  toName: string,
  taskName: string,
  dueDate: string,
  appUrl: string
) {
  await resend.emails.send({
    from: FROM_EMAIL,
    to: toEmail,
    subject: `New Task Assigned: ${taskName}`,
    html: emailWrapper(`
      <h2 style="color: #1e40af; margin-top: 0;">New Task Assigned</h2>
      <p style="color: #374151;">Hi ${toName},</p>
      <p style="color: #6b7280;">A new task has been assigned to you.</p>

      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 10px 8px; font-weight: 600; color: #374151; border-bottom: 1px solid #f3f4f6;">Task</td><td style="padding: 10px 8px; border-bottom: 1px solid #f3f4f6;">${taskName}</td></tr>
        <tr><td style="padding: 10px 8px; font-weight: 600; color: #374151;">Due Date</td><td style="padding: 10px 8px;">${new Date(dueDate).toLocaleDateString()}</td></tr>
      </table>

      <div style="text-align: center; margin-top: 24px;">
        <a href="${appUrl}" style="display: inline-block; background: #1e40af; color: white; padding: 12px 32px; text-decoration: none; border-radius: 8px; font-weight: 600;">
          View Tasks
        </a>
      </div>
    `),
  });
}
