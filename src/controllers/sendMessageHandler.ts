import { Message, MessageReaction, User } from "discord.js";
import { createErrorEmbed, internalError } from "../utils/messages";
import { ERRORS } from "../utils/constants";
import { certificateEmojifilter } from "../utils/filters";
import { handleIncomingReaction } from "./incomingMessageHandler";
import { serverLogger } from "../utils/logger";
import { eventSchema } from "../models/event";
import { getEvent } from "../utils/nodecache";
import { certificateDMHandler } from "../helper/certificate";
import { emailSchema } from "../models/email";
/**
 * Sends message to user in his DMs
 *
 * @param {User} user
 * @param {MessageReaction} reaction
 * @param {any} userMessage message that has to be sent
 */

export async function sendDirectMessageToUser(
  user: User,
  message: Message,
  eventSlug: string,
  userMessage: any
) {
  try {
    const userDM = await user.send(userMessage);
    const collector = await userDM.channel!.createMessageCollector(
      async (dm: Message) => {
        if (dm.author.bot) return false;
        try {
          await emailSchema.validate(dm.content);
          return true;
        } catch (err) {
          serverLogger("user-error", dm.content, "Malformed Email");
          dm.channel.send(
            createErrorEmbed("Invalid Email!", ERRORS.INVALID_EMAIL)
          );
          return false;
        }
      },
      { time: 300000 }
    );
    collector.on("collect", async (dm: Message) => {
      const serviceExecuted = await certificateDMHandler(dm, eventSlug);
      if (serviceExecuted) collector.stop();
    });
    collector.on("end", () => {
      serverLogger("success", "user-collector-ended", "collector has ended");
    });
  } catch (err) {
    serverLogger("error", message, "DM Blocked");
    message.channel.send(ERRORS.DM_BLOCKED(user));
  }
}

/**
 * Sends out a message to a channel which is reactable
 *
 * @param {Message} incomingMessage
 * @param {eventSchema} event
 * @param {string} message
 * @param {any} emoji
 */
export async function sendReactableMessage(
  incomingMessage: Message,
  eventSlug: string,
  message: any,
  emoji: any
) {
  try {
    const event = await getEvent(eventSlug);
    if (!event) throw "eventKey Not Found in NodeCache!";
    const eventMessage = await incomingMessage.channel.send(message);
    await eventMessage.react(emoji);
    // create a reaction collector on the specific message
    const eventCollector = eventMessage.createReactionCollector(
      certificateEmojifilter
    );

    eventCollector.on("collect", (reaction: MessageReaction, user: User) => {
      handleIncomingReaction(user, reaction, event.slug, message);
    });
  } catch (err) {
    serverLogger("error", incomingMessage.content, err);
    incomingMessage.channel.send(internalError());
  }
}
