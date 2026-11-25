// Persistence can provide the cut directly; a v4 JSONL log stores it as an event.
export function sessionBillingHeader(id, header, inheritedEventCount) {
  const marker = { type: 'session', id, createdAt: header?.createdAt }
  if (Number.isSafeInteger(header?.version) && header.version >= 4) marker.version = header.version
  if (typeof header?.isSeeded === 'boolean') marker.isSeeded = header.isSeeded
  if (typeof header?.parentSession === 'string' && header.parentSession) marker.parentSession = header.parentSession
  if (Number.isSafeInteger(header?.seedLength) && header.seedLength >= 0) marker.seedLength = header.seedLength
  if (Number.isSafeInteger(inheritedEventCount) && (inheritedEventCount > 0 || inheritedEventCount === 0 && marker.isSeeded !== undefined)) {
    marker.seedLength = inheritedEventCount
  }
  return marker
}

export function inheritedPrefixLength(header, records) {
  if (Number.isSafeInteger(header?.seedLength) && header.seedLength >= 0) return header.seedLength
  if (header?.isSeeded === false) return 0
  // Nested forks retain ancestor markers. A restart has no inherited flag.
  for (let i = records.length - 1; i >= 0; i--) {
    const row = records[i]
    if (row?.type === 'session/end-seed' && row.data?.inherited === true && Number.isSafeInteger(row.seq) && row.seq >= 0) return row.seq
  }
  return null
}

export function inheritedBoundaryRecord(row) {
  return row.data?.inherited === true ? { type: row.type, seq: row.seq, data: { inherited: true } } : null
}

export function isInheritedEvent(event, prefixLength, createdAt) {
  if (prefixLength !== null && Number.isSafeInteger(event.seq) && event.seq >= 0) return event.seq < prefixLength
  return prefixLength !== 0 && createdAt > 0 && Number(event.time) > 0 && Number(event.time) < createdAt
}
