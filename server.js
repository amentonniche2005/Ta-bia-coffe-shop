require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const CAISSE_TOKEN = process.env.CAISSE_TOKEN || '12345678';

// 🔥 SÉCURITÉ WEBSOCKET
io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers['authorization'];
    if (token === CAISSE_TOKEN || socket.handshake.query.clientType === 'customer') {
        next();
    } else {
        next(new Error("Accès WebSocket refusé. Token invalide."));
    }
});

// ========== 1. CONNEXION MONGODB ATLAS ==========
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { console.error("❌ Erreur critique DB:", err); process.exit(1); });

// ========== 2. MODÈLES DE DONNÉES ==========

const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, 
    nom: String, 
    prix: Number, 
    prixAchat: { type: Number, default: 0 },
    stock: { type: Number, default: 0 }, 
    categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' },
    variantes: { type: String, default: "" }, 
    typeChoix: { type: String, default: "unique" },
    seuilAlerte: { type: Number, default: 10 }, 
    unite: { type: String, default: "unité" },
    actif: { type: Boolean, default: true },
    recette: [{ ingredientId: Number, quantiteConsommee: Number }] // 🔥 Ingrédients
}));

const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: String, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, 
    total: Number, clientId: String, clientName: String,
    methodePaiement: { type: String, default: 'sur_place' }
}));

const LoyalCustomer = mongoose.model('LoyalCustomer', new mongoose.Schema({
    nom: String, prenom: String, telephone: String,
    codeFidelite: { type: String, unique: true },
    dateInscription: { type: String, default: () => new Date().toLocaleDateString('fr-FR') },
    solde: { type: Number, default: 0 },
    totalDepense: { type: Number, default: 0 }
}));

const StoreSettings = mongoose.model('StoreSettings', new mongoose.Schema({
    type: { type: String, unique: true }, palierDepense: Number, bonusOffert: Number
}));

const Sale = mongoose.model('Sale', new mongoose.Schema({
    id: String, numero: String, date: String, timestamp: Number, 
    total: Number, remise: { type: Number, default: 0 },
    methodePaiement: String, tableOrigine: String, articles: Array
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({ numero: Number, code: String, lastUpdated: Number }));
const CashRegister = mongoose.model('CashRegister', new mongoose.Schema({ dateOuverture: String, dateFermeture: String, timestampOuverture: Number, fondDeCaisse: Number, totalVentesEspeces: Number, especesReelles: Number, ecart: Number, statut: String }));
const OpenTicket = mongoose.model('OpenTicket', new mongoose.Schema({ tableNum: String, ticketData: Object, lastUpdated: Number }));
const Expense = mongoose.model('Expense', new mongoose.Schema({ date: String, timestamp: Number, categoriePrincipale: String, sousCategorie: String, beneficiaire: String, description: String, montantTotal: Number, montantPaye: Number, resteAPayer: Number, statut: String, modePaiement: String }));
const Inventory = mongoose.model('Inventory', new mongoose.Schema({ date: String, ecarts: Array }));

// ========== 3. MIDDLEWARES ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function verifierToken(req, res, next) {
    if (req.headers['authorization'] === CAISSE_TOKEN) next();
    else res.status(403).json({ error: "Accès refusé." });
}

// ========== 4. FONCTION CERVEAU : DÉDUCTION STOCK INTELLIGENTE ==========
async function deduireStockAutomatique(produitVenduId, quantiteVendue, raison) {
    const produit = await Product.findOne({ id: produitVenduId });
    if (!produit) return;

    if (produit.recette && produit.recette.length > 0) {
        for (let item of produit.recette) {
            const qteADeduire = item.quantiteConsommee * quantiteVendue;
            const ing = await Product.findOneAndUpdate({ id: item.ingredientId }, { $inc: { stock: -qteADeduire } }, { new: true });
            if (ing) {
                await new Movement({
                    type: 'vente_ingredient', produit: ing.nom, produitId: ing.id, quantite: qteADeduire,
                    ancienStock: parseFloat((ing.stock + qteADeduire).toFixed(2)),
                    nouveauStock: parseFloat(ing.stock.toFixed(2)),
                    raison: `Composant de : ${produit.nom} (${raison})`
                }).save();
            }
        }
    } else if (produit.stock !== undefined) {
        const pUpd = await Product.findOneAndUpdate({ id: produitVenduId }, { $inc: { stock: -quantiteVendue } }, { new: true });
        if (pUpd) {
            await new Movement({
                type: 'vente', produit: pUpd.nom, produitId: pUpd.id, quantite: quantiteVendue,
                ancienStock: parseFloat((pUpd.stock + quantiteVendue).toFixed(2)),
                nouveauStock: parseFloat(pUpd.stock.toFixed(2)), raison: raison
            }).save();
        }
    }
}

// ========== 5. ROUTES COMMANDES & PAIEMENTS ==========

app.post('/api/commandes', async (req, res) => {
    try {
        const codeEnvoye = String(req.body.codeAuth);
        // Vérification Table/Fidélité (Identique à ton code actuel)
        if (req.body.numeroTable && req.body.numeroTable !== 'Emporter') {
            let authValid = false;
            const fidele = await LoyalCustomer.findOne({ codeFidelite: codeEnvoye });
            if (fidele) authValid = true;
            if (!authValid) {
                const tableDb = await TableCode.findOne({ numero: parseInt(req.body.numeroTable) });
                if (tableDb && tableDb.code === codeEnvoye) authValid = true;
            }
            if (codeEnvoye === "00000") authValid = true;
            if (!authValid) return res.status(403).json({ error: "QR Code expiré." });
        }

        // Recalcul Total
        let totalSecurise = 0; let articlesSecurises = [];
        for (let art of req.body.articles) {
            const pDb = await Product.findOne({ id: art.id });
            const prix = pDb ? pDb.prix : art.prix;
            totalSecurise += (prix * art.quantite);
            articlesSecurises.push({ ...art, prix });
        }
        totalSecurise = parseFloat(totalSecurise.toFixed(2));

        let messageBonus = null;
        const cmdId = Date.now().toString();
        const numeroCmd = 'CMD' + Math.floor(Math.random() * 10000);

        // Gestion Wallet VIP
        if (req.body.methodePaiement === 'carte_fidelite') {
            const clientVIP = await LoyalCustomer.findOne({ codeFidelite: codeEnvoye });
            if (!clientVIP || clientVIP.solde < totalSecurise) return res.status(400).json({ error: "Solde insuffisant." });

            const ancienneDepense = clientVIP.totalDepense || 0;
            const configFid = await StoreSettings.findOne({ type: 'fidelite' }) || { palierDepense: 50, bonusOffert: 4 };

            clientVIP.solde = parseFloat((clientVIP.solde - totalSecurise).toFixed(2));
            clientVIP.totalDepense = parseFloat((ancienneDepense + totalSecurise).toFixed(2));

            const nbPaliersAvant = Math.floor(ancienneDepense / configFid.palierDepense);
            const nbPaliersApres = Math.floor(clientVIP.totalDepense / configFid.palierDepense);

            if (nbPaliersApres > nbPaliersAvant) {
                const bonus = (nbPaliersApres - nbPaliersAvant) * configFid.bonusOffert;
                clientVIP.solde = parseFloat((clientVIP.solde + bonus).toFixed(2));
                messageBonus = `Félicitations 🎉 ! Bonus de +${bonus.toFixed(2)} DT ajouté !`;
            }
            await clientVIP.save();

            await new Sale({ id: cmdId, numero: numeroCmd, total: totalSecurise, methodePaiement: 'Carte Fidélité', tableOrigine: `Fidèle: ${clientVIP.prenom}`, articles: articlesSecurises, date: new Date().toLocaleString('fr-FR'), timestamp: Date.now() }).save();
        }

        const cmd = new Order({ ...req.body, articles: articlesSecurises, id: cmdId, numero: numeroCmd, total: totalSecurise, date: new Date().toLocaleString('fr-FR'), timestamp: Date.now(), statut: req.body.methodePaiement === 'en_ligne' ? 'attente_paiement' : 'en_attente' });
        await cmd.save();

        if (req.body.methodePaiement === 'en_ligne') return res.status(201).json({ ...cmd._doc, payUrl: `/api/simulateur-paiement/${cmdId}` });

        io.emit('nouvelle_commande', cmd);
        res.status(201).json({ ...cmd._doc, bonusInfo: messageBonus });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// SIMULATEUR WEB AVEC DÉDUCTION INTELLIGENTE
app.get('/api/simulateur-paiement/:orderId', async (req, res) => {
    try {
        const cmd = await Order.findOne({ id: req.params.orderId });
        if (!cmd || cmd.statut !== 'attente_paiement') return res.send("Commande déjà traitée.");
        cmd.statut = 'en_attente'; await cmd.save();

        for (let art of cmd.articles) { await deduireStockAutomatique(art.id, art.quantite, `Commande WEB #${cmd.numero}`); }

        const vente = new Sale({ id: Date.now().toString(), numero: cmd.numero, total: cmd.total, methodePaiement: 'en_ligne', tableOrigine: `WEB - ${cmd.numeroTable}`, articles: cmd.articles, date: new Date().toLocaleString('fr-FR'), timestamp: Date.now() });
        await vente.save();

        io.emit('nouvelle_commande', cmd); io.emit('update_stock');
        res.send("<h1>Paiement Réussi !</h1><a href='/'>Retour</a>");
    } catch (err) { res.status(500).send(err.message); }
});

// ========== 6. ROUTES ADMIN & STOCK ==========

app.get('/api/settings/fidelite', verifierToken, async (req, res) => {
    let config = await StoreSettings.findOne({ type: 'fidelite' });
    if (!config) config = await new StoreSettings({ type: 'fidelite', palierDepense: 50, bonusOffert: 4 }).save();
    res.json(config);
});

app.post('/api/settings/fidelite', verifierToken, async (req, res) => {
    const config = await StoreSettings.findOneAndUpdate({ type: 'fidelite' }, req.body, { new: true, upsert: true });
    res.json({ success: true, config });
});

app.post('/api/ventes', verifierToken, async (req, res) => {
    try {
        const articles = req.body.articles;
        for (let art of articles) { await deduireStockAutomatique(art.id, art.quantite, `Vente Caisse ${req.body.numero}`); }
        const vente = new Sale({ ...req.body, timestamp: Date.now(), date: new Date().toLocaleString('fr-FR') });
        await vente.save();
        io.emit('update_stock');
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// RESTES DES ROUTES (Initialisation, CRUD Stock, etc. - Identique à ton code original)
app.get('/api/mes-commandes/:clientId', async (req, res) => {
    const cmds = await Order.find({ clientId: req.params.clientId, statut: { $ne: 'paye' } });
    res.json(cmds.map(c => ({ id: c.id, statut: c.statut })));
});

app.post('/api/numbers/refresh/:numero', async (req, res) => {
    const updated = await TableCode.findOneAndUpdate({ numero: req.params.numero }, { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, { upsert: true, new: true });
    res.json(updated);
});

// --- COPIE ICI TOUTES TES AUTRES ROUTES ADMIN (CRUD Stock, Clients, etc.) ---
app.get('/api/customers', verifierToken, async (req,res) => res.json(await LoyalCustomer.find().sort({_id:-1})));
app.post('/api/customers', verifierToken, async (req,res) => res.json(await new LoyalCustomer(req.body).save()));
app.delete('/api/customers/:id', verifierToken, async (req,res) => res.json(await LoyalCustomer.findByIdAndDelete(req.params.id)));
app.get('/api/ventes', verifierToken, async (req,res) => res.json(await Sale.find().sort({timestamp:-1})));
app.get('/api/stock/historique', verifierToken, async (req,res) => res.json(await Movement.find().sort({_id:-1}).limit(200)));

// DÉMARRAGE
server.listen(PORT, () => { console.log(`🚀 TA'BIA Server Ready on Port ${PORT}`); });