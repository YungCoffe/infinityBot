'use strict';

const SAFE_QUANTITIES = Object.freeze([1, 3, 5]);

function randomInt(max, random = Math.random) {
  return Math.floor(random() * max);
}

function assertSafeQuantity(value) {
  const quantity = Number(value);
  if (!SAFE_QUANTITIES.includes(quantity)) throw new Error('Quantidade fora do limite seguro.');
  return quantity;
}

// O Spotify não oferece API pública para esse fluxo; o site monta o parâmetro
// client-side. Estes links são gerados localmente e não representam promoção.
function randomMedium(random = Math.random) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  return Array.from({ length: 15 }, () => alphabet[randomInt(alphabet.length, random)]).join('');
}

function makeSpotifyLinks(quantity, random = Math.random) {
  assertSafeQuantity(quantity);
  return Array.from({ length: quantity }, () =>
    `https://www.spotify.com/br-pt/premium/?utm_source=br-pt_brand_contextual_text&utm_medium=${randomMedium(random)}`
  );
}

function formatPerson(person) {
  const fields = [
    ['Nome', person.nome], ['Idade', person.idade], ['Sexo', person.sexo],
    ['CPF', person.cpf], ['RG', person.rg], ['Nascimento', person.data_nasc],
    ['E-mail', person.email], ['CEP', person.cep], ['Endereço', person.endereco],
    ['Cidade/UF', [person.cidade, person.estado].filter(Boolean).join('/')],
    ['Telefone', person.celular || person.telefone_fixo]
  ];
  return fields.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => `**${label}:** ${value}`).join('\n');
}

module.exports = { SAFE_QUANTITIES, assertSafeQuantity, makeSpotifyLinks, formatPerson };
