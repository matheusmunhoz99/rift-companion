/**
 * Catálogo completo de Cartas de Aprimoramento do ARAM: Desordem (KIWI) e Arena (CHERRY),
 * com cálculo de sinergia (Boa / Média / Ruim) e % de escolha para cada campeão.
 */

export type AugmentRarity = 'silver' | 'gold' | 'prismatic';
export type AugmentTier = 'boa' | 'media' | 'ruim';

export interface AugmentEntry {
  id: number;
  key: string;
  name: string;
  alt?: string;
  rarity: AugmentRarity;
}

export interface AugmentEvaluation {
  augment: AugmentEntry;
  tier: AugmentTier;
  tierLabel: 'BOA' | 'MÉDIA' | 'RUIM';
  /** Taxa de escolha estimada para o campeão atual (2% a 39%). */
  pickRate: number;
  /** Motivo curto da recomendação para o campeão. */
  reason: string;
}

export interface ChampionMeta {
  id: number;
  key: string;
  name: string;
  roles: string[];
}

export const CHAMPIONS_META: ChampionMeta[] = [{"id":1,"key":"Annie","name":"Annie","roles":["mage","support"]},{"id":2,"key":"Olaf","name":"Olaf","roles":["fighter","tank"]},{"id":3,"key":"Galio","name":"Galio","roles":["tank","mage"]},{"id":4,"key":"TwistedFate","name":"Twisted Fate","roles":["mage","marksman"]},{"id":5,"key":"XinZhao","name":"Xin Zhao","roles":["fighter","tank"]},{"id":6,"key":"Urgot","name":"Urgot","roles":["fighter","tank"]},{"id":7,"key":"Leblanc","name":"LeBlanc","roles":["assassin","mage"]},{"id":8,"key":"Vladimir","name":"Vladimir","roles":["mage","fighter"]},{"id":9,"key":"FiddleSticks","name":"Fiddlesticks","roles":["mage","support"]},{"id":10,"key":"Kayle","name":"Kayle","roles":["marksman","mage"]},{"id":11,"key":"MasterYi","name":"Master Yi","roles":["fighter","assassin"]},{"id":12,"key":"Alistar","name":"Alistar","roles":["tank","support"]},{"id":13,"key":"Ryze","name":"Ryze","roles":["mage"]},{"id":14,"key":"Sion","name":"Sion","roles":["tank","fighter"]},{"id":15,"key":"Sivir","name":"Sivir","roles":["marksman"]},{"id":16,"key":"Soraka","name":"Soraka","roles":["support","mage"]},{"id":17,"key":"Teemo","name":"Teemo","roles":["marksman","mage"]},{"id":18,"key":"Tristana","name":"Tristana","roles":["marksman","assassin"]},{"id":19,"key":"Warwick","name":"Warwick","roles":["fighter","tank"]},{"id":20,"key":"Nunu","name":"Nunu e Willump","roles":["tank","mage"]},{"id":21,"key":"MissFortune","name":"Miss Fortune","roles":["marksman","mage"]},{"id":22,"key":"Ashe","name":"Ashe","roles":["marksman","support"]},{"id":23,"key":"Tryndamere","name":"Tryndamere","roles":["fighter","assassin"]},{"id":24,"key":"Jax","name":"Jax","roles":["fighter"]},{"id":25,"key":"Morgana","name":"Morgana","roles":["support","mage"]},{"id":26,"key":"Zilean","name":"Zilean","roles":["support","mage"]},{"id":27,"key":"Singed","name":"Singed","roles":["tank","mage"]},{"id":28,"key":"Evelynn","name":"Evelynn","roles":["assassin","mage"]},{"id":29,"key":"Twitch","name":"Twitch","roles":["marksman","assassin"]},{"id":30,"key":"Karthus","name":"Karthus","roles":["mage"]},{"id":31,"key":"Chogath","name":"Cho'Gath","roles":["tank","mage"]},{"id":32,"key":"Amumu","name":"Amumu","roles":["tank","support"]},{"id":33,"key":"Rammus","name":"Rammus","roles":["tank"]},{"id":34,"key":"Anivia","name":"Anivia","roles":["mage"]},{"id":35,"key":"Shaco","name":"Shaco","roles":["assassin"]},{"id":36,"key":"DrMundo","name":"Dr. Mundo","roles":["tank","fighter"]},{"id":37,"key":"Sona","name":"Sona","roles":["support","mage"]},{"id":38,"key":"Kassadin","name":"Kassadin","roles":["assassin","mage"]},{"id":39,"key":"Irelia","name":"Irelia","roles":["fighter","assassin"]},{"id":40,"key":"Janna","name":"Janna","roles":["support","mage"]},{"id":41,"key":"Gangplank","name":"Gangplank","roles":["fighter"]},{"id":42,"key":"Corki","name":"Corki","roles":["marksman","mage"]},{"id":43,"key":"Karma","name":"Karma","roles":["mage","support"]},{"id":44,"key":"Taric","name":"Taric","roles":["support","tank"]},{"id":45,"key":"Veigar","name":"Veigar","roles":["mage"]},{"id":48,"key":"Trundle","name":"Trundle","roles":["fighter","tank"]},{"id":50,"key":"Swain","name":"Swain","roles":["mage","support"]},{"id":51,"key":"Caitlyn","name":"Caitlyn","roles":["marksman"]},{"id":53,"key":"Blitzcrank","name":"Blitzcrank","roles":["tank","support"]},{"id":54,"key":"Malphite","name":"Malphite","roles":["tank","mage"]},{"id":55,"key":"Katarina","name":"Katarina","roles":["assassin","mage"]},{"id":56,"key":"Nocturne","name":"Nocturne","roles":["fighter","assassin"]},{"id":57,"key":"Maokai","name":"Maokai","roles":["tank","support"]},{"id":58,"key":"Renekton","name":"Renekton","roles":["fighter","tank"]},{"id":59,"key":"JarvanIV","name":"Jarvan IV","roles":["fighter","tank"]},{"id":60,"key":"Elise","name":"Elise","roles":["assassin","mage"]},{"id":61,"key":"Orianna","name":"Orianna","roles":["mage","support"]},{"id":62,"key":"MonkeyKing","name":"Wukong","roles":["fighter","tank"]},{"id":63,"key":"Brand","name":"Brand","roles":["mage","support"]},{"id":64,"key":"LeeSin","name":"Lee Sin","roles":["fighter","assassin"]},{"id":67,"key":"Vayne","name":"Vayne","roles":["marksman","assassin"]},{"id":68,"key":"Rumble","name":"Rumble","roles":["fighter","mage"]},{"id":69,"key":"Cassiopeia","name":"Cassiopeia","roles":["mage"]},{"id":72,"key":"Skarner","name":"Skarner","roles":["tank","fighter"]},{"id":74,"key":"Heimerdinger","name":"Heimerdinger","roles":["mage","support"]},{"id":75,"key":"Nasus","name":"Nasus","roles":["fighter","tank"]},{"id":76,"key":"Nidalee","name":"Nidalee","roles":["assassin","mage"]},{"id":77,"key":"Udyr","name":"Udyr","roles":["fighter","tank"]},{"id":78,"key":"Poppy","name":"Poppy","roles":["tank","fighter"]},{"id":79,"key":"Gragas","name":"Gragas","roles":["fighter","mage"]},{"id":80,"key":"Pantheon","name":"Pantheon","roles":["fighter","assassin"]},{"id":81,"key":"Ezreal","name":"Ezreal","roles":["marksman","mage"]},{"id":82,"key":"Mordekaiser","name":"Mordekaiser","roles":["fighter","mage"]},{"id":83,"key":"Yorick","name":"Yorick","roles":["fighter","tank"]},{"id":84,"key":"Akali","name":"Akali","roles":["assassin"]},{"id":85,"key":"Kennen","name":"Kennen","roles":["mage"]},{"id":86,"key":"Garen","name":"Garen","roles":["fighter","tank"]},{"id":89,"key":"Leona","name":"Leona","roles":["tank","support"]},{"id":90,"key":"Malzahar","name":"Malzahar","roles":["mage"]},{"id":91,"key":"Talon","name":"Talon","roles":["assassin"]},{"id":92,"key":"Riven","name":"Riven","roles":["fighter","assassin"]},{"id":96,"key":"KogMaw","name":"Kog'Maw","roles":["marksman","mage"]},{"id":98,"key":"Shen","name":"Shen","roles":["tank"]},{"id":99,"key":"Lux","name":"Lux","roles":["mage","support"]},{"id":101,"key":"Xerath","name":"Xerath","roles":["mage","support"]},{"id":102,"key":"Shyvana","name":"Shyvana","roles":["fighter","tank"]},{"id":103,"key":"Ahri","name":"Ahri","roles":["mage","assassin"]},{"id":104,"key":"Graves","name":"Graves","roles":["marksman"]},{"id":105,"key":"Fizz","name":"Fizz","roles":["assassin","fighter"]},{"id":106,"key":"Volibear","name":"Volibear","roles":["fighter","tank"]},{"id":107,"key":"Rengar","name":"Rengar","roles":["assassin","fighter"]},{"id":110,"key":"Varus","name":"Varus","roles":["marksman","mage"]},{"id":111,"key":"Nautilus","name":"Nautilus","roles":["tank","support"]},{"id":112,"key":"Viktor","name":"Viktor","roles":["mage"]},{"id":113,"key":"Sejuani","name":"Sejuani","roles":["tank"]},{"id":114,"key":"Fiora","name":"Fiora","roles":["fighter","assassin"]},{"id":115,"key":"Ziggs","name":"Ziggs","roles":["mage"]},{"id":117,"key":"Lulu","name":"Lulu","roles":["support","mage"]},{"id":119,"key":"Draven","name":"Draven","roles":["marksman"]},{"id":120,"key":"Hecarim","name":"Hecarim","roles":["fighter","tank"]},{"id":121,"key":"Khazix","name":"Kha'Zix","roles":["assassin"]},{"id":122,"key":"Darius","name":"Darius","roles":["fighter","tank"]},{"id":126,"key":"Jayce","name":"Jayce","roles":["fighter","marksman"]},{"id":127,"key":"Lissandra","name":"Lissandra","roles":["mage"]},{"id":131,"key":"Diana","name":"Diana","roles":["fighter","assassin"]},{"id":133,"key":"Quinn","name":"Quinn","roles":["marksman","assassin"]},{"id":134,"key":"Syndra","name":"Syndra","roles":["mage"]},{"id":136,"key":"AurelionSol","name":"Aurelion Sol","roles":["mage"]},{"id":141,"key":"Kayn","name":"Kayn","roles":["fighter","assassin"]},{"id":142,"key":"Zoe","name":"Zoe","roles":["mage"]},{"id":143,"key":"Zyra","name":"Zyra","roles":["mage","support"]},{"id":145,"key":"Kaisa","name":"Kai'Sa","roles":["marksman","mage"]},{"id":147,"key":"Seraphine","name":"Seraphine","roles":["support","mage"]},{"id":150,"key":"Gnar","name":"Gnar","roles":["fighter","tank"]},{"id":154,"key":"Zac","name":"Zac","roles":["tank","fighter"]},{"id":157,"key":"Yasuo","name":"Yasuo","roles":["fighter","assassin"]},{"id":161,"key":"Velkoz","name":"Vel'Koz","roles":["mage","support"]},{"id":163,"key":"Taliyah","name":"Taliyah","roles":["mage","support"]},{"id":164,"key":"Camille","name":"Camille","roles":["fighter","assassin"]},{"id":166,"key":"Akshan","name":"Akshan","roles":["marksman","assassin"]},{"id":200,"key":"Belveth","name":"Bel'Veth","roles":["fighter"]},{"id":201,"key":"Braum","name":"Braum","roles":["tank","support"]},{"id":202,"key":"Jhin","name":"Jhin","roles":["marksman","mage"]},{"id":203,"key":"Kindred","name":"Kindred","roles":["marksman"]},{"id":221,"key":"Zeri","name":"Zeri","roles":["marksman"]},{"id":222,"key":"Jinx","name":"Jinx","roles":["marksman"]},{"id":223,"key":"TahmKench","name":"Tahm Kench","roles":["tank","support"]},{"id":233,"key":"Briar","name":"Briar","roles":["fighter","assassin"]},{"id":234,"key":"Viego","name":"Viego","roles":["fighter","assassin"]},{"id":235,"key":"Senna","name":"Senna","roles":["support","marksman"]},{"id":236,"key":"Lucian","name":"Lucian","roles":["marksman","assassin"]},{"id":238,"key":"Zed","name":"Zed","roles":["assassin"]},{"id":240,"key":"Kled","name":"Kled","roles":["fighter"]},{"id":245,"key":"Ekko","name":"Ekko","roles":["assassin","mage"]},{"id":246,"key":"Qiyana","name":"Qiyana","roles":["assassin"]},{"id":254,"key":"Vi","name":"Vi","roles":["fighter","assassin"]},{"id":266,"key":"Aatrox","name":"Aatrox","roles":["fighter"]},{"id":267,"key":"Nami","name":"Nami","roles":["support","mage"]},{"id":268,"key":"Azir","name":"Azir","roles":["mage","marksman"]},{"id":350,"key":"Yuumi","name":"Yuumi","roles":["support","mage"]},{"id":360,"key":"Samira","name":"Samira","roles":["marksman","assassin"]},{"id":412,"key":"Thresh","name":"Thresh","roles":["support","tank"]},{"id":420,"key":"Illaoi","name":"Illaoi","roles":["fighter","tank"]},{"id":421,"key":"RekSai","name":"Rek'Sai","roles":["fighter","tank"]},{"id":427,"key":"Ivern","name":"Ivern","roles":["support","mage"]},{"id":429,"key":"Kalista","name":"Kalista","roles":["marksman"]},{"id":432,"key":"Bard","name":"Bardo","roles":["support","mage"]},{"id":497,"key":"Rakan","name":"Rakan","roles":["support"]},{"id":498,"key":"Xayah","name":"Xayah","roles":["marksman"]},{"id":516,"key":"Ornn","name":"Ornn","roles":["tank"]},{"id":517,"key":"Sylas","name":"Sylas","roles":["mage","assassin"]},{"id":518,"key":"Neeko","name":"Neeko","roles":["mage","support"]},{"id":523,"key":"Aphelios","name":"Aphelios","roles":["marksman"]},{"id":526,"key":"Rell","name":"Rell","roles":["tank","support"]},{"id":555,"key":"Pyke","name":"Pyke","roles":["support","assassin"]},{"id":711,"key":"Vex","name":"Vex","roles":["mage"]},{"id":777,"key":"Yone","name":"Yone","roles":["fighter","assassin"]},{"id":799,"key":"Ambessa","name":"Ambessa","roles":["fighter","assassin"]},{"id":800,"key":"Mel","name":"Mel","roles":["mage","support"]},{"id":804,"key":"Yunara","name":"Yunara","roles":["marksman"]},{"id":805,"key":"Locke","name":"Locke","roles":["assassin","mage"]},{"id":875,"key":"Sett","name":"Sett","roles":["fighter","tank"]},{"id":876,"key":"Lillia","name":"Lillia","roles":["fighter","mage"]},{"id":887,"key":"Gwen","name":"Gwen","roles":["fighter"]},{"id":888,"key":"Renata","name":"Renata Glasc","roles":["support","mage"]},{"id":893,"key":"Aurora","name":"Aurora","roles":["mage","assassin"]},{"id":895,"key":"Nilah","name":"Nilah","roles":["fighter","assassin"]},{"id":897,"key":"KSante","name":"K'Sante","roles":["tank","fighter"]},{"id":901,"key":"Smolder","name":"Smolder","roles":["marksman","mage"]},{"id":902,"key":"Milio","name":"Milio","roles":["support","mage"]},{"id":904,"key":"Zaahen","name":"Zaahen","roles":["fighter"]},{"id":910,"key":"Hwei","name":"Hwei","roles":["mage","support"]},{"id":950,"key":"Naafiri","name":"Naafiri","roles":["assassin","fighter"]}];

export const ARAM_AUGMENTS: AugmentEntry[] = [{"id":1205,"key":"ARAM_ADAPt","name":"ADAPte-se","rarity":"silver"},{"id":1141,"key":"ARAM_AllForYou","name":"Tudo por Você","rarity":"gold"},{"id":1002,"key":"ARAM_ApexInventor","name":"Inventor Apex","rarity":"gold"},{"id":2087,"key":"ARAM_Archmage","name":"Arquimago","rarity":"prismatic"},{"id":1004,"key":"ARAM_BacktoBasics","name":"Voltando ao Básico","rarity":"prismatic"},{"id":2103,"key":"ARAM_BangBang","name":"Lá de Longe","rarity":"gold"},{"id":1180,"key":"ARAM_BigBrain","name":"Inteligência Essencial","rarity":"gold"},{"id":1006,"key":"ARAM_BladeWaltz","name":"Valsa da Lâmina","rarity":"prismatic"},{"id":1007,"key":"ARAM_BluntForce","name":"Força Bruta","rarity":"silver"},{"id":1103,"key":"ARAM_BreadAndButter","name":"Pão com Manteiga","alt":"Mamão com Açúcar","rarity":"gold"},{"id":1151,"key":"ARAM_BreadAndCheese","name":"Pão com Queijo","rarity":"gold"},{"id":1150,"key":"ARAM_BreadAndJam","name":"Pão com Geleia","rarity":"gold"},{"id":1009,"key":"ARAM_BuffBuddies","name":"Amizade de Efeitos","rarity":"silver"},{"id":1011,"key":"ARAM_CantTouchThis","name":"Não Encosta","rarity":"prismatic"},{"id":1013,"key":"ARAM_CelestialBody","name":"Corpo Celestial","rarity":"gold"},{"id":1397,"key":"ARAM_Cerberus","name":"Cérbero","rarity":"prismatic"},{"id":1015,"key":"ARAM_CircleofDeath","name":"Círculo da Morte","rarity":"prismatic"},{"id":1310,"key":"ARAM_ClownCollege","name":"Faculdade de Palhaço","rarity":"prismatic"},{"id":1018,"key":"ARAM_CourageoftheColossus","name":"Coragem do Colosso","rarity":"prismatic"},{"id":1418,"key":"ARAM_CrackOpenThatEgg","name":"Casca de Ovo Quebrada","rarity":"silver"},{"id":1118,"key":"ARAM_CriticalHealing","name":"Cura Crítica","rarity":"gold"},{"id":1323,"key":"ARAM_Cruelty","name":"Crueldade","rarity":"prismatic"},{"id":1019,"key":"ARAM_Dashing","name":"Avançar","rarity":"prismatic"},{"id":1020,"key":"ARAM_DawnbringersResolve","name":"Determinação do Emissário da Luz","rarity":"gold"},{"id":1022,"key":"ARAM_Deft","name":"Especialista","rarity":"silver"},{"id":1023,"key":"ARAM_DemonsDance","name":"Dança Demoníaca","rarity":"gold"},{"id":1025,"key":"ARAM_DiveBomber","name":"Bombardeiro","rarity":"silver"},{"id":2099,"key":"ARAM_DivineDomain","name":"Rito de Ascensão","rarity":"prismatic"},{"id":1301,"key":"ARAM_DivineIntervention","name":"Intervenção Divina","rarity":"gold"},{"id":1026,"key":"ARAM_DontBlink","name":"Não Pisque","rarity":"silver"},{"id":2010,"key":"ARAM_DoubleTap","name":"Enfeitiçamento Coletivo","rarity":"prismatic"},{"id":1134,"key":"ARAM_DrawYourSword","name":"Saque sua Espada","rarity":"prismatic"},{"id":2031,"key":"ARAM_DropBear","name":"Geração de Urso","rarity":"prismatic"},{"id":2006,"key":"ARAM_Dropkick","name":"Chute","rarity":"prismatic"},{"id":1225,"key":"ARAM_DualWield","name":"Ataque Duplo","rarity":"prismatic"},{"id":1027,"key":"ARAM_Earthwake","name":"Abalos Sísmicos","rarity":"prismatic"},{"id":2004,"key":"ARAM_EmpoweredByTheFaithful","name":"Poder da Devoção","rarity":"prismatic"},{"id":2098,"key":"ARAM_EndlessHunt","name":"En Passant","rarity":"prismatic"},{"id":1028,"key":"ARAM_Erosion","name":"Erosão","rarity":"silver"},{"id":1029,"key":"ARAM_EtherealWeapon","name":"Arma Etérea","rarity":"gold"},{"id":1030,"key":"ARAM_Eureka","name":"Eureca","rarity":"prismatic"},{"id":1032,"key":"ARAM_Executioner","name":"Carrasco","rarity":"gold"},{"id":1220,"key":"ARAM_FanTheHammer","name":"Mãos Velozes","rarity":"prismatic"},{"id":1035,"key":"ARAM_FeeltheBurn","name":"Sinta Queimar","rarity":"prismatic"},{"id":1194,"key":"ARAM_FeyMagic","name":"Magia Feérica","rarity":"prismatic"},{"id":1036,"key":"ARAM_Firebrand","name":"Incendiário","rarity":"gold"},{"id":1308,"key":"ARAM_Firefox","name":"Fogo de Raposa","rarity":"silver"},{"id":1037,"key":"ARAM_FirstAidKit","name":"Primeiros Socorros","rarity":"silver"},{"id":1187,"key":"ARAM_Flashbang","name":"Explosão de Luz","rarity":"silver"},{"id":1116,"key":"ARAM_Flashy","name":"Brilhante","rarity":"gold"},{"id":1038,"key":"ARAM_FromBeginningToEnd","name":"Do Início ao Fim","rarity":"gold"},{"id":1039,"key":"ARAM_FrostWraith","name":"Espectro do Gelo","rarity":"silver"},{"id":1322,"key":"ARAM_GetExcited","name":"Anime-se!","rarity":"gold"},{"id":1195,"key":"ARAM_GiantSlayer","name":"Mata-Gigantes","rarity":"prismatic"},{"id":1041,"key":"ARAM_Goliath","name":"Golias","rarity":"prismatic"},{"id":1138,"key":"ARAM_Goredrink","name":"Hemodrenagem","rarity":"silver"},{"id":1042,"key":"ARAM_GuiltyPleasure","name":"Prazer Secreto","rarity":"silver"},{"id":1181,"key":"ARAM_HeavyHitter","name":"Porradeiro","rarity":"silver"},{"id":2107,"key":"ARAM_Hellbent","name":"Possuído","rarity":"prismatic"},{"id":2095,"key":"ARAM_HighRoller","name":"Experiente","rarity":"prismatic"},{"id":1198,"key":"ARAM_HolyFire","name":"Fogo Sagrado","rarity":"gold"},{"id":1105,"key":"ARAM_Homeguard","name":"Guarda Territorial","rarity":"silver"},{"id":1044,"key":"ARAM_IceCold","name":"Geladinho","rarity":"silver"},{"id":1001,"key":"ARAM_ImTheJuggernaut","name":"Determinação Titânica","rarity":"prismatic"},{"id":1149,"key":"ARAM_Impassable","name":"Insuperável","rarity":"gold"},{"id":1045,"key":"ARAM_InfernalConduit","name":"Condutor Infernal","rarity":"prismatic"},{"id":1046,"key":"ARAM_InfernalSoul","name":"Alma Infernal","rarity":"silver"},{"id":2005,"key":"ARAM_InfernoTriggered","name":"Inferno Engatilhado","rarity":"prismatic"},{"id":1047,"key":"ARAM_ItsCritical","name":"Crítico e Crucial","rarity":"gold"},{"id":1211,"key":"ARAM_ItsKillingTime","name":"Hora do Massacre","rarity":"gold"},{"id":1048,"key":"ARAM_JeweledGauntlet","name":"Manopla Adornada","rarity":"prismatic"},{"id":2016,"key":"ARAM_Juiced","name":"Incremento","rarity":"silver"},{"id":1050,"key":"ARAM_KeystoneConjurer","name":"Conjurador de Runas Essenciais","rarity":"gold"},{"id":1305,"key":"ARAM_LegDay","name":"Dia de Perna","rarity":"silver"},{"id":1051,"key":"ARAM_LightemUp","name":"Iluminando!","rarity":"silver"},{"id":1052,"key":"ARAM_LightningStrikes","name":"Golpes Velozes","rarity":"gold"},{"id":2007,"key":"ARAM_LittleDevil","name":"Diabo ao Pé do Ouvido","rarity":"prismatic"},{"id":1053,"key":"ARAM_MadScientist","name":"Cientista Louco","rarity":"prismatic"},{"id":1133,"key":"ARAM_MagicMissile","name":"Projétil Mágico","rarity":"gold"},{"id":1129,"key":"ARAM_Marksmage","name":"Mago Atirador","rarity":"gold"},{"id":1054,"key":"ARAM_MasterofDuality","name":"Mestre da Dualidade","rarity":"prismatic"},{"id":1056,"key":"ARAM_MindtoMatter","name":"Mente Materializada","rarity":"silver"},{"id":1104,"key":"ARAM_Minionmancer","name":"Mestre das Tropas","rarity":"gold"},{"id":1057,"key":"ARAM_MountainSoul","name":"Alma da Montanha","rarity":"silver"},{"id":2055,"key":"ARAM_Multishot","name":"Disparos Múltiplos","rarity":"prismatic"},{"id":1058,"key":"ARAM_MysticPunch","name":"Soco Místico","rarity":"prismatic"},{"id":1060,"key":"ARAM_OceanSoul","name":"Alma do Oceano","rarity":"silver"},{"id":1061,"key":"ARAM_OkBoomerang","name":"Bumerangue OK","rarity":"gold"},{"id":1062,"key":"ARAM_OmniSoul","name":"Omnialma","rarity":"prismatic"},{"id":1208,"key":"ARAM_OrbitalLaser_Active","name":"Laser Orbital","rarity":"prismatic"},{"id":1063,"key":"ARAM_OutlawsGrit","name":"Bravura do Foragido","rarity":"gold"},{"id":1311,"key":"ARAM_Overflow","name":"Transbordamento","rarity":"gold"},{"id":12317,"key":"ARAM_PandorasBox","name":"Caixa de Pandora","rarity":"prismatic"},{"id":1064,"key":"ARAM_Perseverance","name":"Perseverança","rarity":"gold"},{"id":1390,"key":"ARAM_PhenomenalEvil","name":"Poder Maligno Fenomenal","rarity":"gold"},{"id":2003,"key":"ARAM_PoroKing","name":"Pulo do Rei Poro","rarity":"prismatic"},{"id":1409,"key":"ARAM_Poro_Blast","name":"Detonação Poro","rarity":"gold"},{"id":1324,"key":"ARAM_ProteinShake","name":"Shake Proteico","rarity":"prismatic"},{"id":2018,"key":"ARAM_Purist_Caster","name":"Purista - Conjurador","rarity":"silver"},{"id":1066,"key":"ARAM_QuantumComputing","name":"Computação Quântica","rarity":"prismatic"},{"id":1152,"key":"ARAM_Quest_SteelYourHeart","name":"Endureça seu Coração","rarity":"gold"},{"id":1154,"key":"ARAM_Quest_UrfsChampion","name":"Autoridade do URF","rarity":"prismatic"},{"id":1361,"key":"ARAM_Quest_VoidImmolation","name":"Queda de Icathia","rarity":"prismatic"},{"id":1156,"key":"ARAM_Quest_WoogletsWitchcap","name":"Chapéu Mágico de Wooglet","rarity":"prismatic"},{"id":2064,"key":"ARAM_Quickstep","name":"Passo Rápido","rarity":"gold"},{"id":1067,"key":"ARAM_RabbleRousing","name":"Rejuvenescimento","rarity":"gold"},{"id":1313,"key":"ARAM_Recall","name":"Trapaça","rarity":"gold"},{"id":1068,"key":"ARAM_Recursion","name":"Recursão","rarity":"gold"},{"id":1069,"key":"ARAM_Repulsor","name":"Repulsor","rarity":"silver"},{"id":1070,"key":"ARAM_RestlessRestoration","name":"Restauração Incessante","rarity":"gold"},{"id":1170,"key":"ARAM_ScopedWeapons","name":"Armas com Mira","rarity":"silver"},{"id":1071,"key":"ARAM_ScopierWeapons","name":"Armas Flexíveis","rarity":"gold"},{"id":1115,"key":"ARAM_ScopiestWeapons","name":"Armas Extensivas","rarity":"prismatic"},{"id":1072,"key":"ARAM_SearingDawn","name":"Alvorada Flamejante","rarity":"gold"},{"id":1108,"key":"ARAM_SelfDestruct","name":"Autodestruição","rarity":"silver"},{"id":1073,"key":"ARAM_ShadowRunner","name":"Corrida das Sombras","rarity":"silver"},{"id":1074,"key":"ARAM_ShrinkRay","name":"Raio Encolhedor","rarity":"gold"},{"id":1113,"key":"ARAM_SkilledSniper","name":"Fuzileiro de Elite","rarity":"gold"},{"id":1136,"key":"ARAM_SlapAround","name":"Pancada Sucessiva","rarity":"silver"},{"id":1250,"key":"ARAM_SlowAndSteady","name":"Devagar e Sempre","rarity":"gold"},{"id":1075,"key":"ARAM_SlowCooker","name":"Fogo Baixo","rarity":"prismatic"},{"id":2088,"key":"ARAM_Snowday","name":"Dia Nevoso","rarity":"silver"},{"id":1076,"key":"ARAM_SonicBoom","name":"Explosão Sônica","rarity":"silver"},{"id":1077,"key":"ARAM_SoulSiphon","name":"Sifão da Alma","rarity":"gold"},{"id":2100,"key":"ARAM_SpecializedRecursion","name":"Busca por Aceleração","rarity":"gold"},{"id":1405,"key":"ARAM_SpeedDemon","name":"Demônio Veloz","rarity":"silver"},{"id":1214,"key":"ARAM_SpinToWin","name":"Giro da Vitória","rarity":"silver"},{"id":2104,"key":"ARAM_SpiritBomb","name":"Bomba Espiritual","rarity":"prismatic"},{"id":1345,"key":"ARAM_SpiritualPurification","name":"Purificação Espiritual","rarity":"gold"},{"id":1204,"key":"ARAM_StackosaurusRex","name":"Acumulossauro Rex","rarity":"silver"},{"id":1404,"key":"ARAM_Stats","name":"Atributos!","rarity":"silver"},{"id":1403,"key":"ARAM_StatsOnStats","name":"Atributos em Dose Dupla!","rarity":"gold"},{"id":1402,"key":"ARAM_StatsOnStatsOnStats","name":"Atributos em Dose Tripla!","rarity":"prismatic"},{"id":1413,"key":"ARAM_StuckInHereWithMe","name":"Fica Aqui Comigo","rarity":"prismatic"},{"id":2073,"key":"ARAM_SustainingStrike","name":"Sifão","rarity":"silver"},{"id":1079,"key":"ARAM_SymphonyofWar","name":"Sinfonia da Guerra","rarity":"prismatic"},{"id":1353,"key":"ARAM_TankEngine","name":"Motor de Tanque","rarity":"gold"},{"id":1080,"key":"ARAM_TankItOrLeaveIt","name":"Aguenta ou Vaza","rarity":"silver"},{"id":1081,"key":"ARAM_TapDancer","name":"Sapateado","rarity":"prismatic"},{"id":2065,"key":"ARAM_Terror","name":"Terror","rarity":"gold"},{"id":1082,"key":"ARAM_TheBrutalizer","name":"O Brutalizador","rarity":"silver"},{"id":1084,"key":"ARAM_ThreadtheNeedle","name":"Linha na Agulha","rarity":"gold"},{"id":1085,"key":"ARAM_Tormentor","name":"Atormentador","rarity":"silver"},{"id":1243,"key":"ARAM_TransmuteChaos","name":"Transmutar: Caos","rarity":"prismatic"},{"id":1237,"key":"ARAM_TransmuteGold","name":"Transmutar: Ouro","rarity":"silver"},{"id":1238,"key":"ARAM_TransmutePrismatic","name":"Transmutar: Prismático","rarity":"gold"},{"id":1086,"key":"ARAM_TrueshotProdigy","name":"Prodígio Incendiário","rarity":"prismatic"},{"id":1107,"key":"ARAM_TwiceThrice","name":"Encrenca em Dobro","rarity":"gold"},{"id":1087,"key":"ARAM_Typhoon","name":"Tufão","rarity":"silver"},{"id":1088,"key":"ARAM_UltimateRevolution","name":"Revolução Suprema","rarity":"prismatic"},{"id":1112,"key":"ARAM_UltimateUnstoppable","name":"Ultimate Imbatível","rarity":"silver"},{"id":1320,"key":"ARAM_Upgrade_Collector","name":"Aprimorar Coletora","rarity":"silver"},{"id":1317,"key":"ARAM_Upgrade_Cutlass","name":"Aprimorar Alfanje","rarity":"silver"},{"id":1338,"key":"ARAM_Upgrade_Hubris","name":"Aprimorar Húbris","rarity":"gold"},{"id":1336,"key":"ARAM_Upgrade_IE","name":"Aprimorar Gume do Infinito","rarity":"gold"},{"id":1319,"key":"ARAM_Upgrade_Immolate","name":"Aprimorar Imolar","rarity":"silver"},{"id":1996,"key":"ARAM_Upgrade_Sheen","name":"Aprimoramento – Fulgor","rarity":"gold"},{"id":1318,"key":"ARAM_Upgrade_ZH","name":"Aprimorar Zhonya","rarity":"silver"},{"id":2002,"key":"ARAM_VoidRift","name":"Fenda do Vazio","rarity":"prismatic"},{"id":1092,"key":"ARAM_Vulnerability","name":"Vulnerabilidade","rarity":"gold"},{"id":2001,"key":"ARAM_WatchOutGrapefruit","name":"Olha o Bolinho!","rarity":"prismatic"},{"id":1005,"key":"ARAM_WeeWooWeeWoo","name":"Uén Uón Uén Uón","rarity":"gold"},{"id":2008,"key":"ARAM_WeightedPopoffs","name":"Proeminência Pesada","rarity":"silver"},{"id":1095,"key":"ARAM_WindspeakersBlessing","name":"Bênção da Voz do Vento","rarity":"prismatic"},{"id":1097,"key":"ARAM_WitchfulThinking","name":"Pensamentos Sombrios","rarity":"silver"},{"id":1098,"key":"ARAM_WithHaste","name":"Correria","rarity":"gold"},{"id":2089,"key":"ARAM_YowchMyCoins","name":"Ai, Minhas Moedas!","rarity":"gold"},{"id":2009,"key":"ARAM_Zealot","name":"Zelote","rarity":"silver"},{"id":1206,"key":"ARAM_escAPADe","name":"EscapaDdA","rarity":"silver"},{"id":2062,"key":"Ability_SelfAOE_DoubleCast","name":"Conjuração Ecoante","rarity":"prismatic"},{"id":1327,"key":"Adamant","name":"Inflexível","rarity":"silver"},{"id":3118,"key":"ArcaneAxiom","name":"Axioma Arcano","rarity":"gold"},{"id":3049,"key":"ArmoredImpact","name":"Impacto Blindado","rarity":"gold"},{"id":3086,"key":"BEES","name":"ABELHAS!!!","rarity":"gold"},{"id":1372,"key":"BabyKitty","name":"Eu sou Um Gatinho Bebê, Cadê a Mamãe?","rarity":"prismatic"},{"id":3018,"key":"BigShot","name":"Estouro","rarity":"prismatic"},{"id":1329,"key":"BiggestSnowballEver","name":"A Maior Bola de Neve de Todas!","rarity":"prismatic"},{"id":2128,"key":"BloodMoneyBurn","name":"Juros Combustivos","rarity":"gold"},{"id":3051,"key":"BlueBarrier","name":"Barreira Azul","rarity":"silver"},{"id":2111,"key":"Bonk","name":"BONK!","rarity":"gold"},{"id":3048,"key":"BouncingBees","name":"Abelhas Ricocheteantes","rarity":"prismatic"},{"id":3071,"key":"BrassBlast","name":"Explosão Musical","rarity":"gold"},{"id":2042,"key":"BrushPower","name":"Esconderijo no Arbusto","rarity":"gold"},{"id":2083,"key":"BurstingTeeth","name":"Fada dos Dentes","rarity":"gold"},{"id":2078,"key":"ChainReaction","name":"Reação em Cadeia","rarity":"gold"},{"id":3088,"key":"CrimsonCobalt","name":"COBALTO CARMESIM","rarity":"gold"},{"id":1356,"key":"CriticalMissile","name":"Projétil Crítico","rarity":"gold"},{"id":1328,"key":"CriticalRhythm","name":"Ritmo Crítico","rarity":"gold"},{"id":2077,"key":"DarkWind","name":"Vínculo Voraz","rarity":"gold"},{"id":2063,"key":"DimensionShift_Active","name":"Salto Dimensional","rarity":"prismatic"},{"id":7014,"key":"DipDiveDodge","name":"Isca de Fúria","rarity":"silver"},{"id":7003,"key":"DoOrDie","name":"Faça ou Morra","rarity":"prismatic"},{"id":1384,"key":"Donation","name":"Doação","rarity":"gold"},{"id":2131,"key":"DontChangeTheChannel","name":"Não Mude de Canal","rarity":"silver"},{"id":7002,"key":"DontStopCleavin","name":"O Cutelo Não Para","rarity":"gold"},{"id":7008,"key":"DoransBiggestFan","name":"Maior Fã de Doran","rarity":"prismatic"},{"id":2144,"key":"DoubleDefense","name":"Reforçado","rarity":"silver"},{"id":3036,"key":"DoubleTime","name":"Em Dobro","rarity":"gold"},{"id":7004,"key":"DrinkUp","name":"Bebida pra Dentro","rarity":"silver"},{"id":1414,"key":"Dropybara_Active","name":"Do Nada, Capivara","rarity":"prismatic"},{"id":1331,"key":"EmpyreanPromise","name":"Promessa Empírea","rarity":"prismatic"},{"id":3163,"key":"EnchantingButterflies","name":"Borboletas Encantadoras","rarity":"gold"},{"id":2091,"key":"EndlessDecimation","name":"Dizimação Interminável","rarity":"gold"},{"id":2082,"key":"Equilibrium","name":"Nossa Cura","rarity":"gold"},{"id":1333,"key":"EscapePlan","name":"Plano de Fuga","rarity":"silver"},{"id":1344,"key":"FinalForm","name":"Forma Final","rarity":"prismatic"},{"id":2032,"key":"FishBait","name":"Isca de Tubarão","rarity":"gold"},{"id":1348,"key":"Flash2","name":"Flash 2","rarity":"silver"},{"id":3085,"key":"FlowOfSpirit","name":"Fluxo do Espírito","rarity":"silver"},{"id":2127,"key":"ForgedByTheMaster","name":"Forjado pelo Mestre","rarity":"silver"},{"id":3121,"key":"Fruitify","name":"Frutificar","rarity":"silver"},{"id":7010,"key":"FutureSightHeartsteel","name":"Distorção no Tempo: Coração de Aço","rarity":"gold"},{"id":3004,"key":"GetJinxed","name":"Hora da Jinx","rarity":"gold"},{"id":3063,"key":"GiftoftheDrowned","name":"Dádiva dos Afogados","rarity":"silver"},{"id":1325,"key":"GlassCannon","name":"Canhão de Vidro","rarity":"prismatic"},{"id":1392,"key":"GoldenSnowball","name":"Bola de Neve Sagrada","rarity":"prismatic"},{"id":1335,"key":"Goldrend","name":"Laceração Dourada","rarity":"prismatic"},{"id":1406,"key":"GrandmasChiliOil","name":"Molho de Pimenta da Vovó","rarity":"gold"},{"id":3149,"key":"GroupHug","name":"Abraço em Grupo","rarity":"prismatic"},{"id":1401,"key":"GrowthSpurt","name":"Crescimento","rarity":"gold"},{"id":3172,"key":"GoH_PentakillAug_E","name":"ESPERNEIO","rarity":"gold"},{"id":3170,"key":"GoH_PentakillAug_Q","name":"HÍPER","rarity":"gold"},{"id":3173,"key":"GoH_PentakillAug_R","name":"CONDENAÇÃO","rarity":"gold"},{"id":3171,"key":"GoH_PentakillAug_W","name":"PODER","rarity":"gold"},{"id":1389,"key":"HandOfBaron","name":"Mão do Barão","rarity":"prismatic"},{"id":3052,"key":"HandsOffTheTalent","name":"Não Encosta no Talento","rarity":"silver"},{"id":7005,"key":"HasteMakesWaste","name":"A Pressa é Inimiga da Perfeição","rarity":"prismatic"},{"id":3132,"key":"HeavyIsTheCrown","name":"Pesada é a Coroa","rarity":"gold"},{"id":7012,"key":"HexCore","name":"O Núcleo Hex","rarity":"prismatic"},{"id":1416,"key":"HextechSoul","name":"Alma Hextec","rarity":"silver"},{"id":1388,"key":"InfiniteRecursion","name":"Recursão Infinita","rarity":"prismatic"},{"id":2125,"key":"ItsGoTime","name":"Hora de Agir","rarity":"silver"},{"id":3123,"key":"JeweledBracelet","name":"Bracelete de Joias","rarity":"gold"},{"id":2126,"key":"KeepGoing","name":"Recarga","rarity":"gold"},{"id":2026,"key":"KillSecured","name":"Abate Garantido","rarity":"silver"},{"id":1337,"key":"KingMe","name":"Eu, Rei!","rarity":"prismatic"},{"id":1339,"key":"LaserHeal","name":"Cura Laser","rarity":"prismatic"},{"id":3094,"key":"LichBrain","name":"Cérebro de Lich","rarity":"silver"},{"id":2096,"key":"LittleExtraHelp","name":"Ajudinha Extra","rarity":"gold"},{"id":3134,"key":"LonelyWarrior","name":"Combatente Só","rarity":"silver"},{"id":2133,"key":"MercysStrike","name":"Ataque de Misericórdia","rarity":"gold"},{"id":1314,"key":"MightyShield","name":"Escudo Poderoso","rarity":"silver"},{"id":2072,"key":"Missile_Split","name":"Feitiço Dividido","rarity":"prismatic"},{"id":3053,"key":"MoshMonster","name":"Monstro da Roda Punk","rarity":"prismatic"},{"id":2043,"key":"NatureIsHealing","name":"Natureza Restauradora","rarity":"gold"},{"id":1326,"key":"Nightstalking","name":"Caçada Noturna","rarity":"gold"},{"id":3059,"key":"NoManaNoProblem","name":"Sem Mana, sem Problema","rarity":"silver"},{"id":1332,"key":"OminousPact","name":"Pacto Nefasto","rarity":"prismatic"},{"id":2119,"key":"Overextender","name":"Superextensão","rarity":"gold"},{"id":2135,"key":"Overkill","name":"Alfinetada","rarity":"prismatic"},{"id":2123,"key":"Overloaded","name":"Sobrecarga","rarity":"prismatic"},{"id":2137,"key":"PatOnTheBack","name":"Tapinha nas Costas","rarity":"gold"},{"id":2139,"key":"PinCushion","name":"Porco-espinho","rarity":"gold"},{"id":1358,"key":"PinballSnowball","name":"Pinball","rarity":"gold"},{"id":1347,"key":"Poltergeist","name":"Poltergeist","rarity":"silver"},{"id":2102,"key":"PressureCooker","name":"Panela de Pressão","rarity":"gold"},{"id":1421,"key":"PromQueen","name":"Rainha do Baile","rarity":"prismatic"},{"id":1343,"key":"Quest_Sneakerhead","name":"Fã de Calçados","rarity":"prismatic"},{"id":2141,"key":"Quest_UltraHydra","name":"Ultra-Hidra","rarity":"prismatic"},{"id":3075,"key":"Recoil","name":"Coice","rarity":"gold"},{"id":3039,"key":"Salvation","name":"Salvação","rarity":"gold"},{"id":3129,"key":"SapMagic","name":"Seiva Mágica","rarity":"gold"},{"id":2034,"key":"SharkTempest","name":"Tempestade de Tubarões","rarity":"gold"},{"id":1373,"key":"ShrinkEngine","name":"Engenho do Encolhimento","rarity":"gold"},{"id":2109,"key":"SnapBack","name":"Regressar","rarity":"gold"},{"id":1342,"key":"SnowballRoulette","name":"Roleta de Bolas de Neve","rarity":"gold"},{"id":1334,"key":"SnowballUpgrade","name":"Aprimoramento – Bola de Neve","rarity":"gold"},{"id":2080,"key":"Snowbomb","name":"Rajada de Neve","rarity":"gold"},{"id":1420,"key":"Sonata","name":"Sonata","rarity":"gold"},{"id":1375,"key":"SoulEater","name":"Devorador de Almas","rarity":"gold"},{"id":3025,"key":"Sound_Barrier","name":"Barreira do Som","rarity":"silver"},{"id":2116,"key":"SpecializedEmpowerment","name":"Busca por Poder","rarity":"gold"},{"id":2054,"key":"SpellVolley","name":"Tiro Triplo","rarity":"prismatic"},{"id":7013,"key":"SpiritOfTheJungleMain","name":"Espírito de Main Jungle","rarity":"gold"},{"id":2115,"key":"SquishySlappyGrab","name":"Puxão Pegajoso","rarity":"prismatic"},{"id":7006,"key":"StabbyStabby","name":"Apunhalando","rarity":"silver"},{"id":3131,"key":"StillHere","name":"Ainda Estou Aqui","rarity":"gold"},{"id":7015,"key":"SummonersSafari","name":"Safári do Invocador","rarity":"silver"},{"id":2108,"key":"SupportMain","name":"Especialista em Suporte","rarity":"silver"},{"id":2134,"key":"SurgeField","name":"Campo de Impulso","rarity":"prismatic"},{"id":1315,"key":"SwiftAndSafe","name":"Seguro e Veloz","rarity":"silver"},{"id":3116,"key":"TakeemDownDownDown","name":"Derruba, Derruba, Derruba","rarity":"gold"},{"id":2129,"key":"Terraind","name":"Aterramento","rarity":"gold"},{"id":3078,"key":"TheBoomAndTheBass","name":"O Boom e o Grave","rarity":"gold"},{"id":3016,"key":"ThirdTimesTheHarm","name":"No Três Vira Freguês","rarity":"prismatic"},{"id":3058,"key":"TickleMonster","name":"Monstro das Cócegas","rarity":"gold"},{"id":2076,"key":"TitansPulse","name":"Resolução Firme","rarity":"silver"},{"id":3079,"key":"Totentanz","name":"Dança da Morte","rarity":"prismatic"},{"id":1400,"key":"TrainOfTheDead","name":"Trânsito da Cidade Final","rarity":"gold"},{"id":7011,"key":"TrueEternity","name":"Eternidade Verdadeira","rarity":"prismatic"},{"id":2136,"key":"TrustyWeapon","name":"Arma de Confiança","rarity":"silver"},{"id":1415,"key":"Twinfire","name":"Fogo Duplo","rarity":"silver"},{"id":1349,"key":"UltimateAwakening","name":"Despertar Supremo","rarity":"prismatic"},{"id":3055,"key":"UltimateRecursion","name":"Recursão da Ultimate","rarity":"silver"},{"id":2157,"key":"Upgrade_DeathDance","name":"Aprimorar Dança da Morte","rarity":"silver"},{"id":7007,"key":"Upgrade_DeathFireGrasp","name":"Aprimoramento: Sufocamento Ígneo","rarity":"gold"},{"id":7009,"key":"Upgrade_InnervatingLocket","name":"Aprimoramento: Medalhão Enervante","rarity":"gold"},{"id":2140,"key":"Upgrade_Ravenous","name":"Aprimorar Hidra Raivosa","rarity":"gold"},{"id":3150,"key":"Upgrade_Stormsurge","name":"Aprimorar Ápice da Tempestade","rarity":"gold"},{"id":2143,"key":"Upgrade_SunderedSky","name":"Aprimorar Céu Dividido","rarity":"gold"},{"id":1379,"key":"Upgrade_SwordOfBlossom","name":"Aprimorar Espada da Alvorada Florescente","rarity":"prismatic"},{"id":7001,"key":"Upgrade_ZzRotPortal","name":"Aprimoramento: Portal de Zz'rot","rarity":"silver"},{"id":1346,"key":"Vampirism","name":"Vampirismo","rarity":"gold"},{"id":1034,"key":"VeilOfWarding","name":"Véu da Proteção","rarity":"silver"},{"id":2097,"key":"VoidDash","name":"Avanço do Vazio","rarity":"gold"},{"id":2138,"key":"WardingWeapon","name":"Sentinela Adaptativa","rarity":"silver"},{"id":2132,"key":"WarlockJuicebox","name":"Suquinho do Bruxo","rarity":"gold"},{"id":3081,"key":"WeaponOfDestiny","name":"Arma do Destino","rarity":"gold"},{"id":1386,"key":"YouSpinMeRightRound","name":"Meu Mundo Gira","rarity":"silver"}];

const ONHIT_AS_CHAMPS = new Set([
  'Vayne', 'KogMaw', 'Varus', 'Ashe', 'Twitch', 'Kaisa', 'Kalista', 'MasterYi', 'Belveth',
  'Kayle', 'Azir', 'Akshan', 'Jinx', 'Tristana', 'Zeri', 'Yunara', 'Yasuo', 'Yone', 'Tryndamere',
  'Irelia', 'Jax', 'Warwick', 'Teemo', 'Gwen', 'Kindred', 'Quinn', 'TF', 'TwistedFate', 'Briar',
  'Nocturne', 'Viego', 'XinZhao', 'Volibear', 'Udyr', 'Diana', 'Shyvana'
]);

const CRIT_AD_CHAMPS = new Set([
  'Jinx', 'Caitlyn', 'Jhin', 'Draven', 'Yasuo', 'Yone', 'Tryndamere', 'Tristana', 'Sivir',
  'Xayah', 'Aphelios', 'MissFortune', 'Samira', 'Nilah', 'Lucian', 'Graves', 'Gangplank',
  'Kindred', 'Zeri', 'Corki', 'Smolder', 'Vayne', 'Twitch', 'Yunara', 'Akshan', 'Quinn', 'Shaco', 'Rengar'
]);

const ENCHANTER_HEAL_CHAMPS = new Set([
  'Lulu', 'Janna', 'Nami', 'Soraka', 'Sona', 'Seraphine', 'Milio', 'Karma', 'Renata',
  'Yuumi', 'Ivern', 'Taric', 'Senna', 'Zilean', 'Bard', 'Rakan', 'Morgana', 'Lux'
]);

const HEAVY_CC_TANK_CHAMPS = new Set([
  'Leona', 'Nautilus', 'Thresh', 'Blitzcrank', 'Alistar', 'Braum', 'Rell', 'Maokai',
  'Ornn', 'Sion', 'Malphite', 'Zac', 'Sejuani', 'Amumu', 'Rammus', 'Chogath', 'TahmKench',
  'Shen', 'Poppy', 'Skarner', 'KSante', 'Galio', 'Singed', 'Volibear', 'Nunu', 'Gragas', 'Taric'
]);

const POKE_DOT_MAGE_CHAMPS = new Set([
  'Lux', 'Xerath', 'Velkoz', 'Ziggs', 'Brand', 'Zyra', 'Morgana', 'Malzahar', 'Cassiopeia',
  'Viktor', 'Orianna', 'Syndra', 'Ahri', 'Veigar', 'Anivia', 'AurelionSol', 'Azir', 'Hwei',
  'Aurora', 'Mel', 'Zoe', 'Taliyah', 'Swain', 'Karthus', 'Heimerdinger', 'Teemo', 'Lillia',
  'KogMaw', 'Corki', 'Nidalee', 'Jayce', 'Varus', 'Karma', 'Seraphine'
]);

export type AugmentTag =
  | 'as_onhit'
  | 'crit'
  | 'range'
  | 'ad_lethality'
  | 'ap_magic'
  | 'haste_ult'
  | 'burn_poke'
  | 'tank_hp'
  | 'cc_tank'
  | 'heal_shield'
  | 'omnivamp_bruiser'
  | 'mobility_snowball'
  | 'universal_good';

/** Classifica as tags de cada carta pelo id/key/nome. */
export function classifyAugment(aug: AugmentEntry): { tags: AugmentTag[]; label: string } {
  const k = (aug.key + ' ' + aug.name + ' ' + (aug.alt ?? '')).toLowerCase();
  const tags: AugmentTag[] = [];

  if (
    /dualwield|ataque duplo|deft|especialista|lightningstrikes|golpes velozes|tapdancer|sapateado|typhoon|tufão|twicethrice|encrenca em dobro|symphonyofwar|sinfonia da guerra|etherealweapon|arma etérea|lightemup|iluminando|firebrand|incendiário|marksmage|mago atirador|heavyhitter|porradeiro|doubletap|multishot|disparos múltiplos|fanthehammer|mãos velozes|getjinxed|hora da jinx|thirdtimestheharm|no três vira|doublestrike|windbeneathblade|lâmina dos bons|fervor|cérbero|cerberus|ataque|velocidade de ataque/i.test(k)
  ) {
    tags.push('as_onhit');
  }

  if (
    /scoped|scopier|scopiest|armas com mira|armas flexíveis|armas extensivas|drawyoursword|saque sua espada|overextender|superextensão/i.test(k)
  ) {
    tags.push('range', 'as_onhit');
  }

  if (
    /itscritical|crítico e crucial|jeweled|manopla adornada|bracelete de joias|criticalrhythm|ritmo crítico|criticalmissile|projétil crítico|upgrade_ie|gume do infinito|upgrade_collector|coletora|vulnerability|vulnerabilidade|criticalhealing|cura crítica/i.test(k)
  ) {
    tags.push('crit');
  }

  if (
    /bluntforce|força bruta|brutalizer|brutalizador|threadtheneedle|linha na agulha|giantslayer|mata-gigantes|executioner|carrasco|bladewaltz|valsa da lâmina|upgrade_hubris|húbris|upgrade_cutlass|alfanje|upgrade_ravenous|hidra|upgrade_sunderedsky|céu dividido|upgrade_deathdance|dança da morte|dontstopcleavin|cutelo|goldrend|laceração|mercysstrike|spun|spintowin|giro da vitória|killsecured|abate garantido|outlawsgrit|foragido/i.test(k)
  ) {
    tags.push('ad_lethality');
  }

  if (
    /archmage|arquimago|witchfulthinking|pensamentos sombrios|phenomenalevil|poder maligno|wooglet|chapéu mágico|eureka|eureca|masterofduality|dualidade|mindtomatter|mente materializada|bigbrain|inteligência essencial|overflow|transbordamento|upgrade_zh|zhonya|upgrade_stormsurge|ápice da tempestade|upgrade_deathfire|sufocamento ígneo|arcaneaxiom|axioma arcano|lichbrain|cérebro de lich|warlockjuicebox|suquinho do bruxo|purist_caster|conjurador|spellvolley|tiro triplo|missile_split|feitiço dividido|doublecast|conjuração ecoante|spiritbomb|bomba espiritual/i.test(k)
  ) {
    tags.push('ap_magic');
  }

  if (
    /magicmissile|projétil mágico|bangbang|lá de longe|skilledsniper|fuzileiro de elite|trueshotprodigy|prodígio incendiário|infernalconduit|condutor infernal|tormentor|atormentador|searingdawn|alvorada flamejante|holyfire|fogo sagrado|erosion|erosão|firefox|fogo de raposa|okboomerang|bumerangue|orbital|laser orbital|bees|abelhas|twinfire|fogo duplo/i.test(k)
  ) {
    tags.push('burn_poke', 'ap_magic');
  }

  if (
    /breadand|pão com|recursion|recursão|mysticpunch|soco místico|ultimaterevolution|revolução suprema|ultimateawakening|despertar supremo|ultimateunstoppable|ultimate imbatível|quantumcomputing|computação quântica|backtobasics|voltando ao básico|urf|autoridade do urf|hastemakeswaste|a pressa|keepgoing|recarga/i.test(k)
  ) {
    tags.push('haste_ult');
  }

  if (
    /allforyou|tudo por você|windspeakers|voz do vento|firstaidkit|primeiros socorros|sonicboom|explosão sônica|restlessrestoration|restauração incessante|upgrade_mikael|bênção de mikael|swordofblossom|alvorada florescente|laserheal|cura laser|supportmain|especialista em suporte|enchantingbutterflies|borboletas|equilibrium|nossa cura|salvation|salvação|weewooweewoo|uén uón|patontheback|tapinha nas costas|grouphug|abraço em grupo|sonata/i.test(k)
  ) {
    tags.push('heal_shield');
  }

  if (
    /courageofthecolossus|coragem do colosso|cruelty|crueldade|impassable|insuperável|guiltypleasure|prazer secreto|slaparound|pancada sucessiva|frostwraith|espectro do gelo|icecold|geladinho|repulsor|dropkick|chute|squishyslappygrab|puxão pegajoso|moshmonster|roda punk|surgefield|campo de impulso/i.test(k)
  ) {
    tags.push('cc_tank', 'tank_hp');
  }

  if (
    /celestialbody|corpo celestial|goliath|golias|steelyourheart|endureça seu coração|hearts|coração de aço|tankengine|motor de tanque|tankitorleaveit|aguenta ou vaza|perseverance|perseverança|imthejuggernaut|determinação titânica|slowcooker|fogo baixo|voidimmolation|queda de icathia|upgrade_immolate|imolar|upgrade_thornmail|armadura de espinhos|upgrade_innervating|medalhão enervante|upgrade_zzrot|zz'rot|adamant|inflexível|armoredimpact|impacto blindado|doubledefense|reforçado|growthspurt|crescimento|pincushion|porco-espinho|titanspulse|resolução firme|proteinshake|shake proteico|mountainsoul|alma da montanha/i.test(k)
  ) {
    tags.push('tank_hp');
  }

  if (
    /goredrink|hemodrenagem|vampirism|vampirismo|soulsiphon|sifão da alma|sustainingstrike|sifão|demonsdance|dança demoníaca|dawnbringers|emissário da luz|rabble|rejuvenescimento|ominouspact|pacto nefasto|totentanz|circleofdeath|círculo da morte/i.test(k)
  ) {
    tags.push('omnivamp_bruiser');
  }

  if (
    /dashing|avançar|flash|homeguard|guarda territorial|legday|dia de perna|shadowrunner|corrida das sombras|speeddemon|demônio veloz|withhaste|correria|quickstep|passo rápido|dontblink|não pisque|snow|bola de neve|neve|poroking|rei poro|divebomber|bombardeiro|earthwake|abalos sísmicos|voiddash|avanço do vazio/i.test(k)
  ) {
    tags.push('mobility_snowball');
  }

  if (
    /stats|atributos|infernalsoul|alma infernal|oceansoul|alma do oceano|omnisoul|omnialma|hextechsoul|alma hextec|handofbaron|mão do barão|apexinventor|inventor apex|transmute|transmutar|pandorasbox|caixa de pandora|getexcited|anime-se|canttouchthis|não encosta|zhonya|finalform|forma final|glasscannon|canhão de vidro|adapt|adapte-se|escapade|escapadda|keystoneconjurer|runas essenciais/i.test(k)
  ) {
    tags.push('universal_good');
  }

  const labelMap: Record<AugmentTag, string> = {
    as_onhit: 'Vel. de Ataque / On-Hit',
    range: 'Alcance de Ataque',
    crit: 'Crítico / Dano AD',
    ad_lethality: 'Dano Físico / Letalidade',
    ap_magic: 'Poder de Habilidade (AP)',
    burn_poke: 'Poke / Queimadura',
    haste_ult: 'Aceleração de Habilidade / Ult',
    heal_shield: 'Cura e Escudo (Suporte)',
    cc_tank: 'Controle de Grupo / Tanque',
    tank_hp: 'Vida / Resistência (Tanque)',
    omnivamp_bruiser: 'Vampirismo / Lutador',
    mobility_snowball: 'Mobilidade / Bola de Neve',
    universal_good: 'Versátil para qualquer build',
  };
  const label = tags.length ? labelMap[tags[0]] : 'Versátil';
  return { tags, label };
}

function hashJitter(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Resolve o campeão por ID numérico, key ("Vayne") ou nome ("Vayne"). */
export function findChampionMeta(championKeyOrId: number | string | null | undefined): ChampionMeta | null {
  if (championKeyOrId === null || championKeyOrId === undefined) return null;
  if (typeof championKeyOrId === 'number') {
    return CHAMPIONS_META.find((c) => c.id === championKeyOrId) ?? null;
  }
  const q = String(championKeyOrId).trim().toLowerCase();
  return (
    CHAMPIONS_META.find((c) => c.key.toLowerCase() === q || c.name.toLowerCase() === q) ??
    CHAMPIONS_META.find((c) => q.includes(c.name.toLowerCase()) || q.includes(c.key.toLowerCase())) ??
    null
  );
}

/**
 * Calcula se uma carta de aprimoramento é BOA, MÉDIA ou RUIM e a % de escolha
 * para o campeão que o jogador está usando.
 */
export function evaluateAugmentForChampion(
  championKeyOrId: number | string | null | undefined,
  augment: AugmentEntry,
): AugmentEvaluation {
  const champ = findChampionMeta(championKeyOrId);
  const { tags, label } = classifyAugment(augment);
  const roles = new Set(champ?.roles ?? []);
  const key = champ?.key ?? '';
  const champName = champ?.name ?? 'seu campeão';

  const isMarksman = roles.has('marksman');
  const isOnhit = ONHIT_AS_CHAMPS.has(key) || isMarksman;
  const isCrit = CRIT_AD_CHAMPS.has(key) || isMarksman;
  const isMage = roles.has('mage');
  const isEnchanter = ENCHANTER_HEAL_CHAMPS.has(key) || (roles.has('support') && !roles.has('tank'));
  const isTank = roles.has('tank') || HEAVY_CC_TANK_CHAMPS.has(key);
  const isCC = HEAVY_CC_TANK_CHAMPS.has(key);
  const isFighter = roles.has('fighter');
  const isAssassin = roles.has('assassin');
  const isPoke = POKE_DOT_MAGE_CHAMPS.has(key) || isMage;
  const isAD = isMarksman || (isFighter && !isMage) || (isAssassin && !isMage);
  const isAP = isMage || isEnchanter;

  // Pontuação de sinergia (-2 = totalmente fora da classe, 0 = neutra, +2/+3 = perfeita para o campeão)
  let score = 0;

  for (const tag of tags) {
    if (tag === 'range') {
      score += isMarksman ? 3.2 : isOnhit ? 2.2 : -0.8;
    } else if (tag === 'as_onhit') {
      score += isOnhit ? 3.0 : isFighter ? 1.2 : -1.8;
    } else if (tag === 'crit') {
      score += isCrit ? 2.8 : isAD ? 1.1 : -1.8;
    } else if (tag === 'ad_lethality') {
      score += isAD ? 2.5 : -2.0;
    } else if (tag === 'ap_magic') {
      score += isAP ? 2.7 : key === 'Kaisa' || key === 'KogMaw' || key === 'Varus' || key === 'Ezreal' || key === 'Twitch' ? 0.6 : -2.2;
    } else if (tag === 'burn_poke') {
      score += isPoke ? 2.8 : isAP ? 1.8 : -1.8;
    } else if (tag === 'heal_shield') {
      score += isEnchanter ? 3.2 : isTank ? 0.4 : -2.4;
    } else if (tag === 'cc_tank') {
      score += isCC ? 3.0 : isTank ? 2.2 : isFighter ? 0.8 : -2.2;
    } else if (tag === 'tank_hp') {
      score += isTank ? 2.8 : isFighter ? 1.8 : isMarksman || isAssassin ? -1.4 : -0.5;
    } else if (tag === 'omnivamp_bruiser') {
      score += isFighter || isMarksman || isAssassin ? 1.9 : -0.6;
    } else if (tag === 'haste_ult') {
      score += isMage || isEnchanter || isAssassin || isFighter ? 1.8 : 0.8;
    } else if (tag === 'mobility_snowball') {
      score += isTank || isFighter || isAssassin ? 1.6 : 0.7;
    } else if (tag === 'universal_good') {
      score += 1.7;
    }
  }

  // Cartas sem tag específica são utilitárias/gerais (Média)
  if (tags.length === 0) {
    score = 0.6;
  }

  // Bônus leve para cartas Prismáticas que encaixam no campeão
  if (augment.rarity === 'prismatic' && score >= 1.2) score += 0.5;

  const jitter = hashJitter((champ?.id ?? 17) * 1009 + augment.id);
  let tier: AugmentTier;
  let tierLabel: 'BOA' | 'MÉDIA' | 'RUIM';
  let pickRate: number;
  let reason: string;

  if (score >= 1.65) {
    tier = 'boa';
    tierLabel = 'BOA';
    pickRate = Math.min(39, Math.max(22, Math.round(22 + Math.min(score, 4.2) * 3.2 + jitter * 4)));
    reason = `Sinergia alta com ${champName} (${label})`;
  } else if (score >= -0.25) {
    tier = 'media';
    tierLabel = 'MÉDIA';
    pickRate = Math.min(21, Math.max(10, Math.round(11 + (score + 0.3) * 4.5 + jitter * 3)));
    reason = `Opção viável para ${champName} (${label})`;
  } else {
    tier = 'ruim';
    tierLabel = 'RUIM';
    pickRate = Math.min(9, Math.max(2, Math.round(3 + Math.max(0, score + 2.5) * 2 + jitter * 2)));
    reason = `Pouca sinergia com ${champName} (${label})`;
  }

  return { augment, tier, tierLabel, pickRate, reason };
}

/** Retorna todas as cartas do ARAM: Desordem ordenadas da mais escolhida (BOA) para a menos escolhida (RUIM). */
export function rankAugmentsForChampion(championKeyOrId: number | string | null | undefined): AugmentEvaluation[] {
  return ARAM_AUGMENTS.map((a) => evaluateAugmentForChampion(championKeyOrId, a)).sort(
    (a, b) => b.pickRate - a.pickRate || a.augment.name.localeCompare(b.augment.name, 'pt-BR'),
  );
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Encontra a carta pelo título lido na tela (mesmo com pequenas variações de OCR). */
export function matchAugmentByName(rawTitle: string | null | undefined): AugmentEntry | null {
  if (!rawTitle) return null;
  const q = normalizeText(rawTitle);
  if (q.length < 3) return null;

  // 1. Match exato normalizado
  for (const aug of ARAM_AUGMENTS) {
    if (normalizeText(aug.name) === q || (aug.alt && normalizeText(aug.alt) === q)) {
      return aug;
    }
  }
  // 2. Substring contida
  let best: { aug: AugmentEntry; score: number } | null = null;
  for (const aug of ARAM_AUGMENTS) {
    const n = normalizeText(aug.name);
    const a = aug.alt ? normalizeText(aug.alt) : '';
    if (n.includes(q) || q.includes(n) || (a && (a.includes(q) || q.includes(a)))) {
      const lenDiff = Math.abs(n.length - q.length);
      const score = 100 - lenDiff;
      if (!best || score > best.score) best = { aug, score };
    }
  }
  if (best && best.score >= 82) return best.aug;

  // 3. Palavras em comum
  const qWords = q.split(' ').filter((w) => w.length >= 3);
  if (!qWords.length) return null;
  for (const aug of ARAM_AUGMENTS) {
    const nWords = normalizeText(aug.name).split(' ').filter((w) => w.length >= 3);
    const common = qWords.filter((w) => nWords.some((nw) => nw === w || (w.length >= 4 && nw.startsWith(w.slice(0, 4)))));
    if (common.length > 0 && common.length >= Math.max(1, nWords.length - 1)) {
      const score = (common.length / Math.max(qWords.length, nWords.length)) * 90;
      if (!best || score > best.score) best = { aug, score };
    }
  }
  return best && best.score >= 55 ? best.aug : null;
}
