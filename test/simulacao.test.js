'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const games = require('../src/simulacao-jogos.json');
class Builder { setName(){return this} setDescription(){return this} addSubcommand(f){f(new Builder());return this} addIntegerOption(f){f(new Builder());return this} setRequired(){return this} setMinValue(){return this} setMaxValue(){return this} }
const moduleObject={exports:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../src/simulacao.js'),'utf8'), {module:moduleObject, require: name => name==='discord.js' ? {SlashCommandBuilder:Builder, MessageFlags:{Ephemeral:64}} : games, setInterval, clearInterval, Date, console});
const sim=moduleObject.exports;
test('catálogo tem 500 jogos sem IDs inventados',()=>{assert.equal(games.length,500); for(const g of games){assert.ok(g.name);assert.ok(g.id===null || /^\d+$/.test(g.id));assert.equal(g.id!==null,g.match==='unique');}});
test('rotação e prazo calculados localmente',()=>{const s={games:games.slice(0,2),start:1000,interval:120000,duration:300000};assert.equal(sim.snapshot(s,1000).index,0);assert.equal(sim.snapshot(s,121000).index,1);assert.equal(sim.snapshot(s,241000).index,0);assert.equal(sim.snapshot(s,301000).expired,true);assert.equal(sim.snapshot(s,31000).pulses,2)});
test('iniciar, consultar e parar sem rede',async()=>{let response; const interaction={user:{id:'test'}, commandName:'simulacao',isChatInputCommand:()=>true,options:{getSubcommand:()=> 'iniciar',getInteger:n=>({quantidade:2,duracao:10,intervalo:2}[n])},reply:async r=>{response=r.content}}; await sim.handle(interaction); assert.match(response,/Simulação local iniciada/);interaction.options.getSubcommand=()=> 'status'; await sim.handle(interaction);assert.match(response,/Não envia atividade/);interaction.options.getSubcommand=()=> 'parar';await sim.handle(interaction);assert.match(response,/encerrada/);});
