/**
 * SoftPet · 治愈桌宠 — host half.
 *
 * Intentionally empty. SoftPet is a pure client-side companion: the animation,
 * state machine and storage all live in `lib/client.js`, which the Harness
 * loads through the `dsh.client` declaration. Keeping the host half inert means
 * the plugin starts no timers, opens no sockets and touches no files.
 */
export function apply() {
  // Nothing to do on the host.
}
