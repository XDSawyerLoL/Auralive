// A GGUF answer is usable only when it is visible, finite and does not expose
// model reasoning or special chat delimiters. These checks do not claim fluency.
export function sanitizeNativeFrenchGeneration(content,{maxCharacters=6000}={}){
 if(typeof content!=='string'||!content.trim())return null;
 if(content.length>30000)return null;
 let text=content.trim();
 // Reject unclosed private-reasoning blocks rather than publishing them.
 const start=(text.match(/<think>/gi)||[]).length;
 const end=(text.match(/<\/think>/gi)||[]).length;
 if(start!==end)return null;
 text=text.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
 // Reject chat-template leakage rather than merely hiding a bad completion.
 if(/<\|(?:im_start|im_end|endoftext|fim_prefix|fim_suffix|assistant|user|system)\|>/i.test(text))
  return null;
 // Refuse an explicit partial assistant turn, prompt replay, or missing text.
 if(/^(?:assistant|system|user)\s*:/i.test(text))return null;
 if(/(?:^|\n)\s*(?:analyse interne|internal reasoning|chain of thought)\s*:/i.test(text))
  return null;
 if(!text||text.length>maxCharacters||/[\u0000-\u0008\u000e-\u001f]/u.test(text))
  return null;
 // This rejects no other languages; French ability must be measured separately.
 return text;
}
