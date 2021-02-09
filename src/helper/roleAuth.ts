import { GuildMember, Role } from "discord.js";

export async function checkForAccessByRoles(
  user: GuildMember | null,
  roles: Array<string>
) {
  let hasRole: boolean = false;
  roles.forEach((findrole) => {
    if (user && user.roles.cache.has(findrole)) {
      hasRole = true;
    }
  });
  return hasRole;
}
