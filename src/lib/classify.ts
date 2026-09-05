/** Script vs brief classification by shape, plus loose retrieval hints. Pure functions. */
export type InputKind = "script" | "brief" | "unknown";

export type Hints = {
  industry: string[];
  format: string | null;
  flags: string[];
  celebrity: boolean;
  festive: boolean;
};

const SCRIPT_MARKERS: [RegExp, number, string][] = [
  [/^\s*(INT|EXT)\.?\s/im, 2, "scene heading"],
  [/\b(M?F?VO|V\.O\.|VOICE ?OVER)\s*:/i, 2, "voice-over cue"],
  [/\bSFX\b/i, 1, "sound cue"],
  [/\bCUT TO\b/i, 2, "cut to"],
  [/\b(OPEN ON|CLOSE ON|WE SEE|WE OPEN)\b/i, 1, "camera direction"],
  [/\bSUPER\s*:/i, 1, "super"],
  [/\b(SCENE|FRAME|SHOT)\s*\d+/i, 1, "numbered scene"],
  [/^\s*[A-Z][A-Z .'&-]{1,28}\s*(\([^)]*\))?\s*:\s*\S/m, 2, "dialogue line"],
  [/\b(END CARD|PACK ?SHOT|PRODUCT SHOT|LOGO)\b/i, 1, "end card"],
];

const BRIEF_MARKERS: [RegExp, number, string][] = [
  [/\bobjectives?\b/i, 1, "objective"],
  [/\b(target audience|TG|target group)\b/, 1, "target audience"],
  [/\bdeliverables?\b/i, 1, "deliverables"],
  [/\bkey message\b/i, 1, "key message"],
  [/\b(proposition|single[- ]minded)\b/i, 1, "proposition"],
  [/\btone of voice\b/i, 1, "tone of voice"],
  [/\bKPIs?\b/, 1, "kpi"],
  [/\b(platforms?|media plan)\b/i, 1, "platforms"],
  [/\b(mandatories|mandatory)\b/i, 1, "mandatories"],
  [/\b(timeline|on air by|launch date)\b/i, 1, "timeline"],
  [/\b(budget)\b/i, 1, "budget"],
  [/\b(brand|client)\s*:/i, 1, "brand label"],
];

export function wordCount(text: string): number {
  return (text.trim().match(/\S+/g) || []).length;
}

export function classifyInput(text: string): { kind: InputKind; reasons: string[] } {
  const words = wordCount(text);
  if (words < 40) return { kind: "unknown", reasons: [`only ${words} words`] };
  let scriptScore = 0;
  let briefScore = 0;
  const reasons: string[] = [];
  for (const [re, w, label] of SCRIPT_MARKERS) {
    const n = (text.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) || []).length;
    if (n) {
      scriptScore += w * Math.min(n, 3);
      reasons.push(`${label} x${n}`);
    }
  }
  for (const [re, w, label] of BRIEF_MARKERS) {
    if (re.test(text)) {
      briefScore += w;
      reasons.push(label);
    }
  }
  if (scriptScore >= 4 && scriptScore > briefScore) return { kind: "script", reasons };
  if (briefScore >= 3 && briefScore >= scriptScore) return { kind: "brief", reasons };
  if (scriptScore >= 2 && words >= 150) return { kind: "script", reasons };
  return { kind: "unknown", reasons: reasons.length ? reasons : ["no script or brief markers"] };
}

/** Industry names exactly as they appear in the Industries collection, keyed by cue words. */
const INDUSTRY_CUES: [string, RegExp][] = [
  ["Automotive & Auto Marketplaces", /\b(car|cars|suv|sedan|hatchback|bike|scooter|motorcycle|dealership|test drive|showroom|ev\b|electric vehicle)/i],
  ["Aviation", /\b(airline|airlines|flight|aircraft|airport|cabin crew|boarding)\b/i],
  ["Banking & Fintech", /\b(bank|banking|upi|loan|emi|credit card|fintech|payment|payments|wallet|insurance|mutual fund|fixed deposit|savings)\b/i],
  ["Beverages", /\b(drink|drinks|soda|cola|juice|beer|whisky|whiskey|rum|beverage|thums up|coffee|tea|energy drink)\b/i],
  ["Consumer Technology", /\b(smartphone|phone|laptop|headphones|earbuds|camera|gadget|app\b|smartwatch|tablet|5g)/i],
  ["E-commerce", /\b(e-?commerce|online shopping|marketplace|cart|checkout|delivery in|sale day|big billion)\b/i],
  ["Education & EdTech", /\b(school|teacher|teachers|student|students|exam|exams|coaching|learning|edtech|tuition|classroom)\b/i],
  ["FMCG", /\b(soap|shampoo|shower gel|detergent|toothpaste|snack|biscuit|noodles|deodorant|skincare|body wash|face wash|conditioner|cream|lotion|ketchup|masala|oil)\b/i],
  ["Fashion", /\b(fashion|denim|jeans|t-shirt|saree|kurta|apparel|outfit|wardrobe|sneakers|innerwear)\b/i],
  ["Gifting & occasions", /\b(gift|gifting|wedding|anniversary|birthday|valentine|rakhi|raksha bandhan)\b/i],
  ["Healthcare, pharma & wellness", /\b(hospital|doctor|clinic|medicine|tablet|vitamin|pharma|wellness|protein|supplement|fitness|gym)\b/i],
  ["Home & Living", /\b(sofa|mattress|furniture|kitchen appliance|paint|home decor|air conditioner|refrigerator|washing machine)\b/i],
  ["Media, broadcast & entertainment", /\b(streaming|ott|series premiere|channel|broadcast|world cup|ipl|match day|film release|trailer)\b/i],
  ["QSR & Food Service", /\b(burger|pizza|fries|restaurant|outlet|drive-thru|combo meal|menu)\b/i],
  ["Quick Commerce", /\b(10 minutes|ten minutes|quick commerce|instant delivery|grocery delivery|dark store)\b/i],
  ["Social impact, nonprofit & cause-driven", /\b(ngo|nonprofit|donate|donation|awareness|cause|campaign for change|acid attack|survivor|charity|petition)\b/i],
  ["Sportswear & Athletic", /\b(cricket|football|athlete|athletes|sports shoes|jersey|training|sprint|marathon|boots?|kit|bowls?|bowler|stump|wicket|bat|sneakers?|running shoes?)\b/i],
  ["Travel", /\b(hotel|resort|holiday|vacation|tourism|travel|itinerary|check-in)\b/i],
];

const FLAG_CUES: [string, RegExp][] = [
  ["vfx", /\b(vfx|cgi|visual effects|green screen|animated|animation|3d)\b/i],
  ["kids", /\b(kid|kids|child|children|boy|girl|toddler|baby|schoolchildren)\b/i],
  ["animals", /\b(dog|cat|horse|elephant|cow|bird|animal|animals|puppy|tiger)\b/i],
  ["stunts", /\b(stunt|stunts|chase|jump|crash|explosion|fight|leap)\b/i],
  ["crowd", /\b(crowd|stadium|thousands|hundreds|rally|festival|street full|packed)\b/i],
  ["night", /\b(night|dusk|floodlights|midnight|after dark|neon)\b/i],
  ["multi_location", /\b(across the city|multiple locations|montage of|from .* to .*,|cities|villages|road trip)\b/i],
  ["water", /\b(rain|monsoon|sea|ocean|pool|beach|river|underwater|lake)\b/i],
  ["period", /\b(period|1950s|1960s|1970s|1980s|colonial|vintage|retro|era)\b/i],
  ["music_led", /\b(anthem|song|music video|lyrics|track|chorus|beat drops)\b/i],
  ["sport", /\b(cricket|football|match|stadium|athlete|bowler|batsman|goal|race)\b/i],
  ["food", /\b(food|recipe|cooking|kitchen|eat|eating|meal|dish|chef)\b/i],
  ["vehicle", /\b(car|cars|bike|scooter|suv|drive|driving|highway|drift)\b/i],
  ["animation", /\b(animation|animated|cartoon|2d|stop-motion|stop motion)\b/i],
];

const FORMAT_CUES: [string, RegExp][] = [
  ["anthem", /\b(anthem|brand anthem|manifesto film)\b/i],
  ["series", /\b(series of|a series|three films|four films|five films|episodes|episode)\b/i],
  ["brand film", /\b(brand film|manifesto|long[- ]form|3 minute|three minute|4 minute|five minute)\b/i],
  ["TVC", /\b(tvc|television commercial|30 second|30 sec|30s|20 second|20 sec|15 second|15 sec|cutdowns?|on air)\b/i],
  ["digital film", /\b(digital film|digital|youtube|instagram|social film|reel|reels|vertical)\b/i],
];

export function extractHints(text: string): Hints {
  const industry = INDUSTRY_CUES.filter(([, re]) => re.test(text)).map(([name]) => name);
  const flags = FLAG_CUES.filter(([, re]) => re.test(text)).map(([name]) => name);
  const format = FORMAT_CUES.find(([, re]) => re.test(text))?.[0] ?? null;
  const celebrity = /\b(celebrity|celeb|star cast|starring|featuring|ft\.|brand ambassador|as himself|as herself|bollywood|cricketer)\b/i.test(text);
  const festive = /\b(diwali|deepavali|holi|eid|christmas|new year|festive|festival|pongal|onam|durga puja|navratri|raksha bandhan|rakhi)\b/i.test(text);
  return { industry, format, flags, celebrity, festive };
}
