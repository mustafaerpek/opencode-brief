export const styles = `
.handoff {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  padding: 16px;
  overflow: auto;
}

.handoff-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.handoff-error,
.handoff-empty {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.handoff-error {
  color: var(--destructive);
}

.handoff-empty {
  color: var(--muted-foreground);
}

.handoff-stale {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.handoff-stale span {
  color: var(--muted-foreground);
}

.handoff-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px 0;
}

.handoff-settings-note {
  margin: 0;
  color: var(--muted-foreground);
  font-size: 13px;
  line-height: 1.5;
}
`
