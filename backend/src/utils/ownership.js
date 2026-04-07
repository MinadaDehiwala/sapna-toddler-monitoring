const createError = require('http-errors');
const Child = require('../models/Child');

async function getChildForParent(childId, parentId) {
  const child = await Child.findOne({ _id: childId, parentId });

  if (!child) {
    throw createError(404, 'Child not found for this parent.');
  }

  return child;
}

module.exports = { getChildForParent };
