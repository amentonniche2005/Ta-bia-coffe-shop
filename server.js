require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

// ========== 1. CONNEXION MONGODB ATLAS ==========
const mongoURI = process.env.MONGODB_URI;

mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée avec succès !"))
    .catch(err => { console.error("❌ Erreur DB:", err); process.exit(1); });

// ========== 2. MODÈLES DE DONNÉES ==========
const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, nom: String, prix: Number, stock: Number, categorie: String, 
    image: { type: String, default: 'https://via.placeholder.com/150' },
    variantes: { type: String, default: "" }, seuilAlerte: { type: Number, default: 10 }, unite: String
}));

const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') }, ecarts: Array
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    categorie: String, description: String, montant: Number, mode: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, total: Number,
    clientId: String, clientName: String // 👈 Ajout du Nom du Client Fidèle
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

// 🌟 NOUVEAU : CLIENTS FIDÈLES
const LoyalCustomer = mongoose.model('LoyalCustomer', new mongoose.Schema({
    nom: String, prenom: String, telephone: String, codeFidelite: { type: String, unique: true },
    dateInscription: { type: String, default: () => new Date().toLocaleDateString('fr-FR') }
}));

// ========== 3. MIDDLEWARES ET SÉCURITÉ ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_TOKEN = process.env.CAISSE_TOKEN || '12345678';

function verifierToken(req, res, next) {
    if (req.headers['authorization'] === CAISSE_TOKEN) next();
    else res.status(403).json({ error: "Accès refusé." });
}

// ========== 4. ROUTES PUBLIQUES ==========
app.post('/api/caisse/verify', (req, res) => {
    if (req.body.token === CAISSE_TOKEN) res.json({ success: true }); 
    else res.status(401).json({ success: false });
});

app.get('/api/stock', async (req, res) => { res.json(await Product.find({}).sort({ id: 1 })); });
app.post('/api/commandes', async (req, res) => {
    try {
        const cmd = new Order({ ...req.body, id: Date.now(), numero: 'CMD'+Math.floor(Math.random()*10000), date: new Date().toLocaleString('fr-FR'), timestamp: Date.now() });
        await cmd.save(); io.emit('nouvelle_commande', cmd); res.status(201).json(cmd);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/numbers', async (req, res) => { res.json(await TableCode.find({}).sort({ numero: 1 })); });
app.post('/api/numbers/refresh/:numero', async (req, res) => {
    const updated = await TableCode.findOneAndUpdate({ numero: req.params.numero }, { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, { upsert: true, new: true });
    res.json(updated);
});

// 🌟 VÉRIFIER UN CODE FIDÈLE (PUBLIC)
app.get('/api/customers/verify/:code', async (req, res) => {
    const customer = await LoyalCustomer.findOne({ codeFidelite: req.params.code });
    if (customer) res.json({ success: true, customer }); else res.status(404).json({ success: false });
});

// ========== 5. ROUTES SÉCURISÉES (CAISSE & ADMIN) ==========
// Gestion Clients Fidèles
app.get('/api/customers', verifierToken, async (req, res) => { res.json(await LoyalCustomer.find({}).sort({ _id: -1 })); });
app.post('/api/customers', verifierToken, async (req, res) => {
    try { const nouveau = new LoyalCustomer(req.body); await nouveau.save(); res.json({ success: true }); } 
    catch (err) { res.status(500).json({ error: "Erreur" }); }
});
app.delete('/api/customers/:id', verifierToken, async (req, res) => { await LoyalCustomer.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Commandes
app.get('/api/commandes', verifierToken, async (req, res) => { res.json(await Order.find({ statut: { $ne: 'paye' } })); });
app.put('/api/commandes/:id/statut', verifierToken, async (req, res) => {
    const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
    io.emit('mise_a_jour_commande', cmd); res.json(cmd);
});
app.put('/api/commandes/table/:numeroTable/paye', verifierToken, async (req, res) => {
    const commandes = await Order.find({ numeroTable: req.params.numeroTable, statut: { $ne: 'paye' } });
    for (let cmd of commandes) { cmd.statut = 'paye'; await cmd.save(); io.emit('mise_a_jour_commande', cmd); }
    res.json({ success: true });
});

// Stock & Dépenses
app.post('/api/stock', verifierToken, async (req, res) => { const n = new Product({ ...req.body, id: Date.now() }); await n.save(); io.emit('update_stock'); res.json({ success: true }); });
app.put('/api/stock/:id', verifierToken, async (req, res) => { await Product.findOneAndUpdate({ id: req.params.id }, req.body); io.emit('update_stock'); res.json({ success: true }); });
app.delete('/api/stock/:id', verifierToken, async (req, res) => { await Product.findOneAndDelete({ id: req.params.id }); io.emit('update_stock'); res.json({ success: true }); });
app.post('/api/stock/:id/add', verifierToken, async (req, res) => {
    const p = await Product.findOne({ id: req.params.id });
    if (p) { const a = p.stock; p.stock += parseInt(req.body.quantite); await p.save(); await new Movement({ type: 'ajout', produit: p.nom, produitId: p.id, quantite: req.body.quantite, ancienStock: a, nouveauStock: p.stock, raison: req.body.raison || 'Réception' }).save(); io.emit('update_stock'); res.json({ success: true }); }
});
app.post('/api/stock/decrementer', verifierToken, async (req, res) => {
    for (let art of req.body.articles) { const p = await Product.findOneAndUpdate({ id: art.id }, { $inc: { stock: -art.quantite } }, { new: true }); if (p) await new Movement({ type: 'vente', produit: p.nom, produitId: art.id, quantite: art.quantite, nouveauStock: p.stock, raison: "Vente" }).save(); }
    io.emit('update_stock'); res.json({ success: true });
});

app.get('/api/stock/historique', verifierToken, async (req, res) => { res.json(await Movement.find({}).sort({ _id: -1 }).limit(100)); });
app.get('/api/stock/inventaires', verifierToken, async (req, res) => { res.json(await Inventory.find({}).sort({ _id: -1 })); });
app.post('/api/stock/inventaire', verifierToken, async (req, res) => {
    const ecarts = [];
    for (let p of req.body.produits) { const dbP = await Product.findOne({ id: p.id }); if (dbP) { const a = dbP.stock; dbP.stock = p.stockPhysique; await dbP.save(); ecarts.push({ produit: dbP.nom, ancien: a, nouveau: p.stockPhysique, ecart: p.stockPhysique - a }); } }
    await new Inventory({ ecarts }).save(); io.emit('update_stock'); res.json({ success: true });
});

app.get('/api/depenses', verifierToken, async (req, res) => res.json(await Expense.find({}).sort({ _id: -1 })));
app.post('/api/depenses', verifierToken, async (req, res) => { await new Expense(req.body).save(); res.json({ success: true }); });

mongoose.connection.once('open', () => { server.listen(PORT, () => { console.log(`🚀 TA'BIA Coffee Shop Online ! Port: ${PORT}`); }); });