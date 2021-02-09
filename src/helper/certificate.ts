import { Message } from "discord.js";
import * as Jimp from "jimp";
import { join } from "path";
import { emailSchema } from "../models/email";
import {
  getYourCertificateChannelMessage,
  internalError,
  unauthorizedUser,
  createErrorEmbed,
  invalidCommand,
  eventDoesNotExist,
} from "../utils/messages";
import { CONSTANTS, ERRORS } from "../utils/constants";
import { getUserCertificate } from "../service/certificate-service";
import { sendReactableMessage } from "../controllers/sendMessageHandler";
import { checkForAccessByRoles } from "./roleAuth";
import { serverLogger } from "../utils/logger";
import { getDbClient } from "../utils/database";
import { eventSchema } from "../models/event";
import { setEvent } from "../utils/nodecache";

export async function certificateDMHandler(
  incomingMessage: Message,
  eventSlug: string
): Promise<boolean> {
  const email = incomingMessage.content.trim();
  try {
    const serviceExecuted = await getUserCertificate(
      incomingMessage,
      eventSlug,
      email
    );
    return serviceExecuted;
  } catch (err) {
    serverLogger("error", incomingMessage.content, err);
    incomingMessage.channel.send(internalError());
    return true;
  }
}

export async function getCertificateChannelMessage(incomingMessage: Message) {
  try {
    const isAllowed = await checkForAccessByRoles(incomingMessage.member, [
      `${process.env.OPERATOR_ROLE_ID}`,
    ]);
    if (isAllowed) {
      const eventSlug = incomingMessage.content.split(/ +/)[2];
      if (!eventSlug) {
        serverLogger("user-error", incomingMessage.content, "Invalid Command");
        return incomingMessage.channel.send(invalidCommand());
      }
      const db = await (await getDbClient()).db().collection("events");
      const event = await db.findOne<eventSchema>({ slug: eventSlug });
      if (!event) {
        serverLogger(
          "user-error",
          incomingMessage.content,
          "Event Does Not Exist"
        );
        return incomingMessage.channel.send(eventDoesNotExist());
      }
      if (!(await setEvent(event))) throw "Cannot set nodeCache Key!";
      await sendReactableMessage(
        incomingMessage,
        event.slug,
        getYourCertificateChannelMessage(event.name),
        CONSTANTS.thumbsUpEmoji
      );
    } else {
      serverLogger("user-error", incomingMessage.content, "Unauthorized User");
      incomingMessage.channel.send(unauthorizedUser());
    }
  } catch (err) {
    serverLogger("internal-error", "Error", err);
    incomingMessage.channel.send(internalError());
  }
}

export async function generateCertificate(
  name: string,
  event: eventSchema
): Promise<Buffer> {
  const certParams = event.certificate;
  let imgObject = await Jimp.read(certParams.url);
  imgObject = await imgObject.print(
    await Jimp.loadFont(
      join(__dirname, "..", "..", "..", "assets", "font.fnt")
    ),
    certParams.x,
    certParams.y,
    {
      text: name,
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
    },
    certParams.maxWidth,
    certParams.maxHeight
  );
  return imgObject.quality(100).getBufferAsync(Jimp.MIME_JPEG);
}
