import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from './config.js';

const Listing = z.object({
  street_address: z.string().nullable().describe('Número y calle, p. ej. "123 NW 5th Ave Unit 4". null si no aparece.'),
  city: z.string().nullable(),
  state: z.string().nullable().describe('Código de 2 letras, p. ej. FL'),
  zip: z.string().nullable(),
  address_status: z.enum(['complete', 'partial', 'missing'])
    .describe('complete = número + calle + (ciudad o zip); partial = solo calle, cruce, barrio o ciudad; missing = sin ubicación'),
  price_usd: z.number().nullable(),
  arv_usd: z.number().nullable().describe('After Repair Value si lo mencionan'),
  beds: z.number().nullable(),
  baths: z.number().nullable(),
  sqft: z.number().nullable(),
  lot_sqft: z.number().nullable(),
  year_built: z.number().nullable(),
  property_type: z.enum(['single_family', 'condo', 'townhouse', 'multifamily', 'land', 'commercial', 'mobile_home', 'other', 'unknown']),
  deal_type: z.enum(['off_market', 'wholesale', 'mls_listing', 'auction', 'rental', 'other', 'unknown']),
  condition: z.string().nullable().describe('Estado: needs rehab, turnkey, etc.'),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  contact_email: z.string().nullable(),
  photo_links: z.array(z.string()).describe('URLs de fotos/carpetas (Drive, Dropbox, Google Photos, etc.)'),
  portal_links: z.array(z.string()).describe('URLs de portales: Zillow, Redfin, Realtor, MLS, etc.'),
  summary: z.string().describe('Resumen en español de 1 frase'),
});

export const Extraction = z.object({
  is_property_listing: z.boolean().describe('false si el mensaje es charla, saludo, pregunta o publicidad no inmobiliaria'),
  listings: z.array(Listing).describe('Una entrada por propiedad. Un mensaje puede traer varias.'),
});

const SYSTEM = `Eres un analista que extrae datos estructurados de mensajes de grupos de WhatsApp de inversionistas y agentes inmobiliarios en EE. UU. (principalmente el sur de Florida).
Reglas:
- Extrae solo lo que está en el texto o en las imágenes (flyers). No inventes direcciones, precios ni contactos; usa null.
- Lee las imágenes adjuntas: los flyers suelen traer dirección, precio y datos de contacto.
- Normaliza precios a número en USD ("$325k" -> 325000, "1.2M" -> 1200000).
- Si solo hay ciudad o barrio, address_status = "partial". Si no hay nada de ubicación, "missing".
- Clasifica cada URL como photo_links o portal_links según su dominio.
- Si el mensaje no ofrece ninguna propiedad, is_property_listing = false y listings = [].`;

const MEDIA_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const MAX_IMAGES = 5;

let client;
const getClient = () => (client ??= new Anthropic());

/**
 * @param {{text: string, images?: {path: string}[], groupName?: string, sender?: string}} post
 */
export async function extractListings(post) {
  const content = [];
  for (const img of (post.images || []).slice(0, MAX_IMAGES)) {
    const ext = img.path.slice(img.path.lastIndexOf('.')).toLowerCase();
    const media_type = MEDIA_TYPES[ext];
    if (!media_type) continue;
    const data = (await fs.readFile(img.path)).toString('base64');
    content.push({ type: 'image', source: { type: 'base64', media_type, data } });
  }
  content.push({
    type: 'text',
    text: `Grupo: ${post.groupName || 'desconocido'}\nAutor: ${post.sender || 'desconocido'}\n\nMensaje:\n${post.text || '(sin texto, solo imágenes)'}`,
  });

  const response = await getClient().messages.parse({
    model: config.claudeModel,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: config.claudeEffort, format: zodOutputFormat(Extraction) },
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error(`Claude declinó el mensaje (${response.stop_details?.category ?? 'sin categoría'})`);
  }
  if (!response.parsed_output) {
    throw new Error(`Respuesta sin JSON válido (stop_reason=${response.stop_reason})`);
  }
  return response.parsed_output;
}
