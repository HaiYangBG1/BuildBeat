// Outbound channel presentation; the runtime owns event timing and delivery.
function renderText(notification) {
  const lines = [
    notification.title,
    `work: ${notification.work}  status: ${notification.status}`,
  ];
  for (const reason of notification.reasons ?? []) {
    lines.push(`- ${reason}`);
  }
  if (notification.candidate) {
    lines.push(`candidate: ${notification.candidate}`);
  }
  for (const shot of notification.screenshots ?? []) {
    lines.push(`screenshot: ${shot.ref} ${shot.digest}`);
  }
  if (notification.nextReply?.length) {
    lines.push("next:");
    for (const line of notification.nextReply) {
      lines.push(`  ${line}`);
    }
  }
  return lines.join("\n");
}

export function payloadFor(channel, notification) {
  if (channel.type === "dingtalk") {
    // DingTalk custom robots require a configured keyword in the text; the
    // title carries it (default "BuildBeat").
    const text = renderText(notification);
    return {
      msgtype: "text",
      text: {
        content: text.includes(channel.keyword)
          ? text
          : `${channel.keyword}\n${text}`,
      },
    };
  }
  return { ...notification, text: renderText(notification) };
}
