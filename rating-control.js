document.addEventListener("DOMContentLoaded", function() {
  var RatingControl = function(element) {
    var self = this;
    self.containerElement = element;
    self.selectedRatingElement = self.containerElement.querySelector(".current-rating");
    self.selectedRatingSVGContainer = self.selectedRatingElement.querySelector(".svg-wrapper");
    self.ratingElements = [].slice.call(self.containerElement.querySelectorAll(".rating-option")).map(function(element) {
      return {
        container: element,
        icon: element.querySelector(".icon"),
        label: element.querySelector(".label"),
        selectedFill: self.hexToRGB(element.getAttribute("selected-fill") || "#FFD885")
      };
    });

    self.selectedRating;
    self.sliderPosition = 0;
    self.facePaths = [];
    self.labelColor = self.hexToRGB("#ABB2B6");
    self.labelSelectedColor = self.hexToRGB("#313B3F");
    self.dragging = false;
    self.handleDragOffset = 0;
    self.ratingTouchStartPosition = {x:0, y:0};
    self.onRatingChange = function() {};
    self.easings = {
      easeInOutCubic: function(t, b, c, d) {
        if ((t/=d/2) < 1) return c/2*t*t*t + b;
        return c/2*((t-=2)*t*t + 2) + b;
      },
      easeInOutQuad: function(t, b, c, d) {
        if ((t/=d/2) < 1) return c/2*t*t + b;
        return -c/2 * ((--t)*(t-2) - 1) + b;
      },
      linear: function (t, b, c, d) {
        return c*t/d + b;
      }
    };

    self.onHandleDrag = self.onHandleDrag.bind(this);
    self.onHandleRelease = self.onHandleRelease.bind(this);

    self.ratingElements.forEach(function(element) {
      // Copy face path data from HTML
      var paths = {};
      [].forEach.call(element.icon.querySelectorAll("path:not(.base)"), function(path) {
        var pathStr = path.getAttribute("d");
        paths[path.getAttribute("class")] = self.splitString(pathStr);
      });
      self.facePaths.push(paths);
      // On rating selected
      element.container.addEventListener("ontouchend" in document ? "touchend" : "click", function(e) {
        if ("ontouchend" in document) {
          var ratingTouchCurrentPosition = {x: e.pageX, y: e.pageY};
          var dragDistance = Math.sqrt(Math.pow(ratingTouchCurrentPosition.x - self.ratingTouchStartPosition.x, 2) + Math.pow(ratingTouchCurrentPosition.y - self.ratingTouchStartPosition.y, 2));
          if (dragDistance > 10) {
            return;
          }
        }
        var newRating = element.container.getAttribute("rating") - 1;
        self.setRating(newRating, {fireChange: true});
      });
    });

    if ("ontouchend" in document) {
      document.body.addEventListener("touchstart", function(e) {
        if (e.target.classList.contains("rating-option")) {
          self.ratingTouchStartPosition = {x: e.touches[0].pageX, y: e.touches[0].pageY};
        }
      });
      self.selectedRatingElement.addEventListener("touchstart", function(e) {
        self.dragging = true;
        self.handleDragOffset = e.touches[0].pageX - self.selectedRatingElement.getBoundingClientRect().left;
        self.setLabelTransitionEnabled(false);
      });
      self.selectedRatingElement.addEventListener("touchmove", self.onHandleDrag);
      self.selectedRatingElement.addEventListener("touchend", self.onHandleRelease);
    } else {
      document.body.addEventListener("mousedown", function(e) {
        if (e.target == self.selectedRatingElement) {
          e.preventDefault();
          self.dragging = true;
          self.handleDragOffset = e.offsetX;
          self.setLabelTransitionEnabled(false);
          document.body.classList.add("dragging");
          document.body.addEventListener("mousemove", self.onHandleDrag);
        }
      });
      document.body.addEventListener("mouseup", function(e) {
        if (self.dragging) {
          document.body.classList.remove("dragging");
          document.body.removeEventListener("mousemove", self.onHandleDrag);
          self.onHandleRelease(e);
        }
      });
    }

    self.setRating(3, {duration: 0});
  }

  RatingControl.prototype = {
    setRating: function(rating, options) {
      var self = this;
      var options = options || {};
      var startTime;
      var fireChange = options.fireChange || false;
      var onComplete = options.onComplete || function() {};
      var easing = options.easing || self.easings.easeInOutCubic;
      var duration = options.duration == undefined ? 550 : options.duration;
      var startXPosition = self.sliderPosition;
      var endXPosition = rating * self.selectedRatingElement.offsetWidth;

      if (duration > 0) {
        var anim = function(timestamp) {
          startTime = startTime || timestamp;
          var elapsed = timestamp - startTime;
          var progress = easing(elapsed, startXPosition, endXPosition - startXPosition, duration);
          self.setSliderPosition(progress);
          if (elapsed < duration) {
            requestAnimationFrame(anim);
          } else {
            self.setSliderPosition(endXPosition);
            self.setLabelTransitionEnabled(true);
            if (self.onRatingChange && self.selectedRating != rating && fireChange) {
              self.onRatingChange(rating);
            }
            onComplete();
            self.selectedRating = rating;
          }
        };

        self.setLabelTransitionEnabled(false);
        requestAnimationFrame(anim);
      } else {
        self.setSliderPosition(endXPosition);
        if (self.onRatingChange && self.selectedRating != rating && fireChange) {
          self.onRatingChange(rating);
        }
        onComplete();
        self.selectedRating = rating;
      }
    },

    setSliderPosition: function(position) {
      var self = this;
      self.sliderPosition = Math.min(Math.max(0, position), self.containerElement.offsetWidth - self.selectedRatingElement.offsetWidth);
      var stepProgress = self.sliderPosition / self.containerElement.offsetWidth * self.ratingElements.length;
      var relativeStepProgress = stepProgress - Math.floor(stepProgress);
      var currentStep = Math.round(stepProgress);
      var startStep = Math.floor(stepProgress);
      var endStep = Math.ceil(stepProgress);
      // Move handle
      self.selectedRatingElement.style.transform = "translateX(" + (self.sliderPosition / self.selectedRatingElement.offsetWidth * 100) + "%)";
      // Set face
      var startPaths = self.facePaths[startStep];
      var endPaths = self.facePaths[endStep];
      var interpolatedPaths = {};
      for (var featurePath in startPaths) {
        if (startPaths.hasOwnProperty(featurePath)) {
            var startPath = startPaths[featurePath];
            var endPath = endPaths[featurePath];
            var interpolatedPoints = self.interpolatedArray(startPath.digits, endPath.digits, relativeStepProgress);
            var interpolatedPath = self.recomposeString(interpolatedPoints, startPath.nondigits);
            interpolatedPaths[featurePath] = interpolatedPath;
        }
      }
      var interpolatedFill = self.interpolatedColor(self.ratingElements[startStep]["selectedFill"], self.ratingElements[endStep]["selectedFill"], relativeStepProgress);
      self.selectedRatingSVGContainer.innerHTML = '<svg width="55px" height="55px" viewBox="0 0 50 50"><path d="M50,25 C50,38.807 38.807,50 25,50 C11.193,50 0,38.807 0,25 C0,11.193 11.193,0 25,0 C38.807,0 50,11.193 50,25" class="base" fill="' + interpolatedFill + '"></path><path d="' + interpolatedPaths["mouth"] + '" class="mouth" fill="#655F52"></path><path d="' + interpolatedPaths["right-eye"] + '" class="right-eye" fill="#655F52"></path><path d="' + interpolatedPaths["left-eye"] + '" class="left-eye" fill="#655F52"></path></svg>';
      // Update marker icon/label
      self.ratingElements.forEach(function(element, index) {
        var adjustedProgress = 1;
        if (index == currentStep) {
          adjustedProgress = 1 - Math.abs((stepProgress - Math.floor(stepProgress) - 0.5) * 2);
        }
        element.icon.style.transform = "scale(" + adjustedProgress + ")";
        element.label.style.transform = "translateY(" + self.interpolatedValue(9, 0, adjustedProgress) + "px)";
        element.label.style.color = self.interpolatedColor(self.labelSelectedColor, self.labelColor, adjustedProgress);
      });
    },

    onHandleDrag: function(e) {
      var self = this;
      e.preventDefault();
      if (e.touches) {
        e = e.touches[0];
      }
      var offset = self.selectedRatingElement.offsetWidth / 2 - self.handleDragOffset;
      var xPos = e.clientX - self.containerElement.getBoundingClientRect().left;
      self.setSliderPosition(xPos - self.selectedRatingElement.offsetWidth / 2 + offset);
    },

    onHandleRelease: function(e) {
      var self = this;
      self.dragging = false;
      self.setLabelTransitionEnabled(true);
      var rating = Math.round(self.sliderPosition / self.containerElement.offsetWidth * self.ratingElements.length);
      self.setRating(rating, {duration: 200, fireChange: true});
    },

    setLabelTransitionEnabled: function(enabled) {
      var self = this;
      self.ratingElements.forEach(function(element) {
        if (enabled) {
          element.label.classList.remove("no-transition");
        } else {
          element.label.classList.add("no-transition");
        }
      });
    },

    interpolatedValue: function(startValue, endValue, progress) {
      return (endValue - startValue) * progress + startValue;
    },

    interpolatedArray: function(startArray, endArray, progress) {
      return startArray.map(function(startValue, index) {
        return (endArray[index] - startValue) * progress + startValue;
      });
    },

    interpolatedColor: function(startColor, endColor, progress) {
      var self = this;
      var interpolatedRGB = self.interpolatedArray(startColor, endColor, progress).map(function(channel) {
        return Math.round(channel);
      });
      return "rgba(" + interpolatedRGB[0] + "," + interpolatedRGB[1] + "," + interpolatedRGB[2] + ",1)";
    },

    easeInQuint: function(t, b, c, d) {
      return c*(t/=d)*t*t + b;
    },

    hexToRGB: function(hex) {
      // Expand shorthand form to full form
      var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
      });
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
      ] : null;
    },

    splitString: function(value) {
      var re = /-?\d*\.?\d+/g;
      var toStr = function toStr(val) {
        return typeof val == "string" ? val : String(val);
      };
      return {
        digits: toStr(value).match(re).map(Number),
        nondigits: toStr(value).split(re)
      };
    },

    recomposeString: function(digits, nondigits) {
      return nondigits.reduce(function (a, b, i) {
        return a + digits[i - 1] + b;
      });
    },

    simulateRatingTap(rating, delay, complete) {
      var self = this;
      var ratingElement = self.ratingElements[rating];
      setTimeout(function() {
        ratingElement.container.classList.add("show-touch");
        setTimeout(function() {
          ratingElement.container.classList.remove("show-touch");
          self.setRating(rating, {
            onComplete: function() {
              if (complete) {
                complete();
              }
            }
          });
        }, 250);
      }, delay || 0);
    },

    simulateRatingDrag(rating, delay, complete) {
      var self = this;
      setTimeout(function() {
        self.selectedRatingElement.classList.add("show-touch");
        setTimeout(function() {
          self.setRating(rating, {
            duration: 3000,
            easing: self.easings.easeInOutQuad,
            onComplete: function() {
              self.selectedRatingElement.classList.remove("show-touch");
              if (complete) {
                complete();
              }
            }
          });
        }, 250);
      }, delay || 0);
    }
  }


  document.querySelector(".demo-container").classList.add("clip-marker");
  var ratingControl = new RatingControl(document.querySelector(".rating-control"));
});