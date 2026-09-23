let map;
let launchMarker = null;
let targetMarker = null;

document.addEventListener("DOMContentLoaded", function () {

  populateMissileDropdown();

  attachEventListeners();

  loadIndiaBoundary(function (data) {

    if (map) {

      map.data.addGeoJson(data);

      map.data.setStyle({
        fillColor: "red",
        fillOpacity: 0.05,
        strokeColor: "red",
        strokeWeight: 2
      });

    }

  });

});


async function initMap() {

  const { Map } =
    await google.maps.importLibrary("maps");

  map = new Map(
    document.getElementById("map"),
    {
      center:{
        lat:22.5937,
        lng:78.9629
      },

      zoom:5,

      mapTypeId:"roadmap"
    }
  );


  if (indiaGeoJSON) {

    map.data.addGeoJson(indiaGeoJSON);

    map.data.setStyle({
      fillColor:"red",
      fillOpacity:0.05,
      strokeColor:"red",
      strokeWeight:2
    });

  }

}


function populateMissileDropdown() {

  const select =
    document.getElementById("missileSelect");


  missileDatabase.forEach(function(missile){

    const option =
      document.createElement("option");


    option.value =
      missile.id;


    option.textContent =
      missile.name;


    select.appendChild(option);

  });

}


function attachEventListeners() {

  document
    .getElementById("missileSelect")
    .addEventListener(
      "change",
      onMissileChange
    );


  document
    .getElementById("analyzeBtn")
    .addEventListener(
      "click",
      onAnalyzeClick
    );


  document
    .getElementById("launchLat")
    .addEventListener(
      "input",
      function(){
        updateMarker("launch");
      }
    );


  document
    .getElementById("launchLon")
    .addEventListener(
      "input",
      function(){
        updateMarker("launch");
      }
    );


  document
    .getElementById("targetLat")
    .addEventListener(
      "input",
      function(){
        updateMarker("target");
      }
    );


  document
    .getElementById("targetLon")
    .addEventListener(
      "input",
      function(){
        updateMarker("target");
      }
    );

}


function onMissileChange() {

  const select =
    document.getElementById("missileSelect");


  const missile =
    missileDatabase.find(function(m){

      return m.id === select.value;

    });


  document.getElementById(
    "configuredRange"
  ).value =
    missile
      ? missile.rangeKm + " km"
      : "";


  document.getElementById(
    "configRangeStat"
  ).textContent =
    missile
      ? missile.rangeKm + " km"
      : "— km";

}


function updateMarker(type) {

  if (!map) return;


  const lat =
    Number(
      document.getElementById(
        type + "Lat"
      ).value
    );


  const lon =
    Number(
      document.getElementById(
        type + "Lon"
      ).value
    );


  if (
    isNaN(lat) ||
    isNaN(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {

    return;

  }


  const position = {
    lat:lat,
    lng:lon
  };


  if (type === "launch") {

    if (launchMarker) {
      launchMarker.setMap(null);
    }


    launchMarker =
      new google.maps.Marker({

        position:position,

        map:map,

        title:"Launch Point",

        icon:{
          path:
            google.maps.SymbolPath.CIRCLE,

          scale:7,

          fillColor:"#2563c9",

          fillOpacity:1,

          strokeColor:"#ffffff",

          strokeWeight:2
        }

      });


    document.getElementById(
      "launchPointStat"
    ).textContent =
      lat.toFixed(4) +
      ", " +
      lon.toFixed(4);

  }


  else {

    if (targetMarker) {
      targetMarker.setMap(null);
    }


    targetMarker =
      new google.maps.Marker({

        position:position,

        map:map,

        title:"Target Point",

        icon:{
          path:
            google.maps.SymbolPath.CIRCLE,

          scale:7,

          fillColor:"#d1451f",

          fillOpacity:1,

          strokeColor:"#ffffff",

          strokeWeight:2
        }

      });


    document.getElementById(
      "targetPointStat"
    ).textContent =
      lat.toFixed(4) +
      ", " +
      lon.toFixed(4);

  }


  if (
    launchMarker &&
    targetMarker
  ) {

    const bounds =
      new google.maps.LatLngBounds();


    bounds.extend(
      launchMarker.getPosition()
    );


    bounds.extend(
      targetMarker.getPosition()
    );


    map.fitBounds(
      bounds,
      60
    );

  }

}


function onAnalyzeClick() {

  const launchLat =
    Number(
      document.getElementById(
        "launchLat"
      ).value
    );


  const launchLon =
    Number(
      document.getElementById(
        "launchLon"
      ).value
    );


  const targetLat =
    Number(
      document.getElementById(
        "targetLat"
      ).value
    );


  const targetLon =
    Number(
      document.getElementById(
        "targetLon"
      ).value
    );


  const select =
    document.getElementById(
      "missileSelect"
    );


  const missile =
    missileDatabase.find(function(m){

      return m.id === select.value;

    });


  if (
    isNaN(launchLat) ||
    isNaN(launchLon) ||
    isNaN(targetLat) ||
    isNaN(targetLon)
  ) {

    alert(
      "Please enter valid coordinates for both points."
    );

    return;

  }


  if (!missile) {

    alert(
      "Please select a range configuration."
    );

    return;

  }


  const distanceKm =
    calculateDistanceKm(
      launchLat,
      launchLon,
      targetLat,
      targetLon
    );


  document.getElementById(
    "launchPointStat"
  ).textContent =
    launchLat.toFixed(4) +
    ", " +
    launchLon.toFixed(4);


  document.getElementById(
    "targetPointStat"
  ).textContent =
    targetLat.toFixed(4) +
    ", " +
    targetLon.toFixed(4);


  document.getElementById(
    "calcDistance"
  ).textContent =
    distanceKm.toFixed(1) +
    " km";


  document.getElementById(
    "configRangeStat"
  ).textContent =
    missile.rangeKm +
    " km";


  const rangeCheck =
    document.getElementById(
      "rangeCheckStatus"
    );


  const validation =
    document.getElementById(
      "rangeValidationStatus"
    );


  if (
    distanceKm <= missile.rangeKm
  ) {

    rangeCheck.textContent =
      "WITHIN RANGE";


    rangeCheck.className =
      "stat-value range-ok";


    validation.textContent =
      "RANGE CONDITION SATISFIED";


    validation.className =
      "stat-value range-ok";

  }


  else {

    rangeCheck.textContent =
      "EXCEEDS RANGE";


    rangeCheck.className =
      "stat-value range-fail";


    validation.textContent =
      "RANGE CONDITION NOT SATISFIED";


    validation.className =
      "stat-value range-fail";

  }


  const banner =
    document.getElementById(
      "resultBanner"
    );


  banner.querySelector(
    ".banner-title"
  ).textContent =
    "RANGE VALIDATION COMPLETE";


  banner.querySelector(
    ".banner-text"
  ).textContent =
    "Calculated distance: " +
    distanceKm.toFixed(1) +
    " km. Configured range: " +
    missile.rangeKm +
    " km.";


  if (map) {

    const bounds =
      new google.maps.LatLngBounds();


    bounds.extend({
      lat:launchLat,
      lng:launchLon
    });


    bounds.extend({
      lat:targetLat,
      lng:targetLon
    });


    map.fitBounds(
      bounds,
      60
    );

  }

}