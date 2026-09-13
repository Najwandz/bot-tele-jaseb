import { Composer } from "grammy";
import redeemCommand from "./redeem";
import statusCommand from "./status";
import sewaJasaCommand from "./sewa_jasa";
import endsubCommand from "./endsub";
import groupsCommand from "./groups";
import broadcastCommand from "./broadcast";
import broadcastStatusCommand from "./broadcast_status";
import settingsCommand from "./settings";
import notifyCommand from "./notify";
import joinGroupsCommand from "./join_groups";
import controlCommand from "./control";
import remoteCommand from "./remote";

const composer = new Composer();

composer.use(sewaJasaCommand);
composer.use(redeemCommand);
composer.use(broadcastCommand);
composer.use(broadcastStatusCommand);
composer.use(groupsCommand);
composer.use(settingsCommand);
composer.use(notifyCommand);
composer.use(joinGroupsCommand);
composer.use(controlCommand);
composer.use(remoteCommand);
composer.use(statusCommand);
composer.use(endsubCommand);

export default composer;
