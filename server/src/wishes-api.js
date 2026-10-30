const express = require('express');
const { authUser, optionalUser } = require('./middleware/auth');
const wishes = require('./services/wishes');
const router = express.Router();
function handle(fn) { return async (req,res,next) => { try { res.json({ok:true,data:await fn(req)}); } catch(error) {
  if (error.status) return res.status(error.status).json({ok:false,message:error.message});
  next(error);
} }; }
router.get('/wishes/meta', handle(() => ({categories:wishes.CATEGORIES})));
router.get('/me/wish-orders',authUser,handle(req=>wishes.orders(req.userId)));
router.get('/me/wishes',authUser,handle(req=>wishes.list(req.userId,req.query)));
router.post('/wishes',authUser,handle(req=>wishes.create(req.userId,req.body)));
router.get('/wishes/:token',optionalUser,handle(req=>wishes.detail(req.params.token,req.userId)));
router.post('/wishes/:token/claim',authUser,handle(req=>wishes.mutate(req.params.token,req.userId,'claim',req.body?.revision)));
router.delete('/wishes/:token/claim',authUser,handle(req=>wishes.mutate(req.params.token,req.userId,'release',req.body?.revision)));
router.post('/wishes/:token/complete',authUser,handle(req=>wishes.mutate(req.params.token,req.userId,'complete',req.body?.revision)));
router.post('/wishes/:token/close',authUser,handle(req=>wishes.mutate(req.params.token,req.userId,'close',req.body?.revision)));
router.post('/wishes/:token/bless',authUser,handle(req=>wishes.bless(req.params.token,req.userId,req.body)));
router.get('/wishes/:token/payment',authUser,handle(req=>wishes.payment(req.params.token,req.userId)));
module.exports = router;
