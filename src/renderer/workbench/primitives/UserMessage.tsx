export function UserMessage({ text }: { text: string }) {
  return (
    <article className="message-row is-user">
      <div className="user-message">{text}</div>
    </article>
  )
}