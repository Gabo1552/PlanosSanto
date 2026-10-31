# frozen_string_literal: true
# Ruby 3.1 anonymous block forwarding. espera: sintaxis Ruby 2.7
def cada(list, &)
  list.each(&)
end
