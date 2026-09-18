import type {ChatEntry} from '../../shared/types.js';

export const SPEECH_MS=5000;
export const SPEECH_HEIGHT=3.15;

export function speakerOf(entry:Pick<ChatEntry,'id'|'name'>,self:{id:string;name:string},players:readonly{id:string;name:string}[]){
  if(entry.id){
    if(entry.id===self.id)return self.id;
    if(players.some(player=>player.id===entry.id))return entry.id;
  }
  if(entry.name===self.name)return self.id;
  return players.find(player=>player.name===entry.name)?.id??null;
}

export function liveChatEntries(entries:readonly ChatEntry[],replace=false){
  return replace?[]:entries.filter(entry=>entry.text);
}
