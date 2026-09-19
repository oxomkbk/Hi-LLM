export const ACCESS_SETTINGS_UPDATED_EVENT = 'hi-llm:access-settings-updated'
export const ACCESS_SETTINGS_BROADCAST_CHANNEL = 'hi-llm-access-settings'

interface AccessSettingsUpdatedMessage {
  configVersion: string
  type: 'access-settings-updated'
}

export function broadcastAccessSettingsUpdated(configVersion: string) {
  if (typeof window === 'undefined')
    return

  const message: AccessSettingsUpdatedMessage = {
    configVersion,
    type: 'access-settings-updated',
  }
  window.dispatchEvent(new CustomEvent(ACCESS_SETTINGS_UPDATED_EVENT, { detail: message }))

  if (!('BroadcastChannel' in window))
    return
  try {
    const channel = new BroadcastChannel(ACCESS_SETTINGS_BROADCAST_CHANNEL)
    channel.postMessage(message)
    channel.close()
  }
  catch {
    // Saving the server-side setting must not fail when a browser blocks cross-tab channels.
  }
}

export function isAccessSettingsUpdatedMessage(value: unknown): value is AccessSettingsUpdatedMessage {
  if (!value || typeof value !== 'object')
    return false
  const message = value as Partial<AccessSettingsUpdatedMessage>
  return message.type === 'access-settings-updated' && typeof message.configVersion === 'string'
}
