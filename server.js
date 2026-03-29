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

// ========== CONNEXION MONGODB ==========
const mongoURI = process.env.MONGODB_URI;
mongoose.connect(mongoURI)
    .then(() => console.log("🚀 TA'BIA DB : Connectée !"))
    .catch(err => { console.error("❌ Erreur DB:", err); process.exit(1); });

// ========== MODÈLES DE DONNÉES ==========
const Product = mongoose.model('Product', new mongoose.Schema({
    id: Number, nom: String, prix: Number, stock: Number, categorie: String, 
    seuilAlerte: { type: Number, default: 10 }, unite: String, fournisseur: String
}));

const Movement = mongoose.model('Movement', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    type: String, produit: String, produitId: Number, quantite: Number,
    ancienStock: Number, nouveauStock: Number, raison: String
}));

const Inventory = mongoose.model('Inventory', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    ecarts: Array
}));

const Expense = mongoose.model('Expense', new mongoose.Schema({
    date: { type: String, default: () => new Date().toLocaleString('fr-FR') },
    categorie: String, description: String, montant: Number, mode: String
}));

const Order = mongoose.model('Order', new mongoose.Schema({
    id: Number, numero: String, date: String, timestamp: Number, articles: Array,
    numeroTable: String, statut: { type: String, default: 'en_attente' }, total: Number
}));

const TableCode = mongoose.model('TableCode', new mongoose.Schema({
    numero: Number, code: String, lastUpdated: Number
}));

// ========== MIDDLEWARES ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const CAISSE_PASSWORD = process.env.CAISSE_PASSWORD || '1234';

// ========== API ROUTES STOCK (RESTAURÉES) ==========

// 1. Lire tout le stock
app.get('/api/stock', async (req, res) => {
    const produits = await Product.find({}).sort({ id: 1 });
    res.json(produits);
});

// 2. AJOUTER un nouveau produit (Bouton "Ajouter")
app.post('/api/stock', async (req, res) => {
    const nouveau = new Product({ ...req.body, id: Date.now() });
    await nouveau.save();
    res.json({ success: true, produit: nouveau });
});

// 3. MODIFIER un produit (Bouton "Éditer")
app.put('/api/stock/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const misAJour = await Product.findOneAndUpdate({ id: id }, req.body, { new: true });
        res.json({ success: true, produit: misAJour });
    } catch (err) { res.status(500).json(err); }
});

// 4. SUPPRIMER un produit (Bouton "Poubelle")
app.delete('/api/stock/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        await Product.findOneAndDelete({ id: id });
        res.json({ success: true });
    } catch (err) { res.status(500).json(err); }
});

// 5. AJOUT DE QUANTITÉ (Bouton "+")
app.post('/api/stock/:id/add', async (req, res) => {
    const id = parseInt(req.params.id);
    const { quantite, raison } = req.body;
    const p = await Product.findOne({ id: id });
    if (p) {
        const ancien = p.stock;
        p.stock += parseInt(quantite);
        await p.save();
        await new Movement({ type: 'ajout', produit: p.nom, produitId: id, quantite, ancienStock: ancien, nouveauStock: p.stock, raison }).save();
        res.json({ success: true, produit: p });
    } else { res.status(404).send(); }
});

// 6. HISTORIQUE DES MOUVEMENTS
app.get('/api/stock/historique', async (req, res) => {
    res.json(await Movement.find({}).sort({ _id: -1 }).limit(100));
});

// 7. INVENTAIRES (HISTORIQUE DES AUDITS)
app.get('/api/stock/inventaires', async (req, res) => {
    res.json(await Inventory.find({}).sort({ _id: -1 }));
});

// 8. CRÉER UN INVENTAIRE (Bouton "Valider Inventaire")
app.post('/api/stock/inventaire', async (req, res) => {
    const { produits } = req.body;
    const ecarts = [];
    for (let p of produits) {
        const dbP = await Product.findOne({ id: p.id });
        if (dbP) {
            const ancien = dbP.stock;
            dbP.stock = p.stockPhysique;
            await dbP.save();
            ecarts.push({ produit: dbP.nom, ancien, nouveau: p.stockPhysique, ecart: p.stockPhysique - ancien });
        }
    }
    const inv = new Inventory({ ecarts });
    await inv.save();
    res.json({ success: true, inventaire: inv });
});

// ========== AUTRES ROUTES ==========
app.post('/api/stock/decrementer', async (req, res) => {
    for (let art of req.body.articles) {
        const p = await Product.findOneAndUpdate({ id: art.id }, { $inc: { stock: -art.quantite } }, { new: true });
        await new Movement({ type: 'vente', produit: p.nom, produitId: art.id, quantite: art.quantite, nouveauStock: p.stock, raison: "Vente" }).save();
    }
    res.json({ success: true });
});

app.get('/api/depenses', async (req, res) => res.json(await Expense.find({}).sort({ _id: -1 })));
app.post('/api/depenses', async (req, res) => { await new Expense(req.body).save(); res.json({ success: true }); });

app.post('/api/commandes', async (req, res) => {
    const cmd = new Order({ ...req.body, id: Date.now(), numero: 'CMD'+Math.floor(Math.random()*10000), date: new Date().toLocaleString(), timestamp: Date.now() });
    await cmd.save();
    io.emit('nouvelle_commande', cmd);
    res.status(201).json(cmd);
});
app.get('/api/commandes', async (req, res) => res.json(await Order.find({ statut: { $ne: 'paye' } })));
app.put('/api/commandes/:id/statut', async (req, res) => {
    const cmd = await Order.findOneAndUpdate({ id: req.params.id }, { statut: req.body.statut }, { new: true });
    io.emit('mise_a_jour_commande', cmd);
    res.json(cmd);
});

app.get('/api/numbers', async (req, res) => res.json(await TableCode.find({}).sort({ numero: 1 })));
app.post('/api/numbers/refresh/:numero', async (req, res) => {
    res.json(await TableCode.findOneAndUpdate({ numero: req.params.numero }, { code: Math.floor(Math.random()*90000+10000).toString(), lastUpdated: Date.now() }, { upsert: true, new: true }));
});

app.post('/api/caisse/verify', (req, res) => res.json({ success: req.body.password === CAISSE_PASSWORD }));

// ========== DÉMARRAGE ==========
mongoose.connection.once('open', () => {
    server.listen(PORT, () => console.log(`🚀 TA'BIA Online (Version Complète) sur ${PORT}`));
});