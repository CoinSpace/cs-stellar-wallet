'use strict';

var axios = require('axios');

function getRequest(url, params) {
  return axios.get(url, {params: params})
    .then(function(res) {
      return res.data;
    });
}

function postRequest(url, item) {
  return axios.post(url, item)
    .then(function(res) {
      return res.data;
    });
}

module.exports = {
  getRequest: getRequest,
  postRequest: postRequest
};
